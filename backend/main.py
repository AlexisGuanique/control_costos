from datetime import datetime
from typing import List

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlmodel import Session, select

from ai_service import ai_service
from auth import (
    authenticate_user,
    create_access_token,
    get_current_user,
    get_password_hash,
)
from database import create_db_and_tables, get_session
from exchange_service import get_ars_conversion_rate, get_all_rates
from models import (
    AddMemberRequest,
    AIExpenseRequest,
    Expense,
    ExpenseCategory,
    ExpenseCreate,
    ExpenseRead,
    ExpenseSource,
    ExpenseStats,
    ExpenseUpdate,
    MemberBalance,
    SettlementTransaction,
    Trip,
    TripCreate,
    TripDetail,
    TripExpense,
    TripExpenseCreate,
    TripExpenseRead,
    TripExpenseSplit,
    TripExpenseSplitRead,
    TripMember,
    TripMemberRead,
    TripRead,
    TripRole,
    TripSettlement,
    TripStatus,
    TripUpdate,
    User,
    UserCreate,
    UserRead,
    UserSearchResult,
    UserUpdate,
)

app = FastAPI(
    title="FinTrack AI API",
    description="API para gestión de finanzas personales con IA y multi-moneda",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, session: Session = Depends(get_session)) -> User:
    existing = session.exec(select(User).where(User.email == user_data.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El email ya está registrado",
        )

    user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        full_name=user_data.full_name,
        base_currency=user_data.base_currency,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@app.post("/auth/token")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session),
) -> dict:
    user = authenticate_user(form_data.username, form_data.password, session)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token({"sub": user.id})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/auth/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)) -> User:
    return current_user


@app.patch("/auth/me", response_model=UserRead)
def update_me(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if update_data.full_name is not None:
        current_user.full_name = update_data.full_name.strip()

    if update_data.base_currency is not None:
        allowed = {"ARS", "USD", "EUR"}
        if update_data.base_currency.upper() not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Moneda no soportada. Opciones: {', '.join(allowed)}",
            )
        current_user.base_currency = update_data.base_currency.upper()

    if update_data.new_password:
        if not update_data.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Se requiere la contraseña actual para cambiarla",
            )
        from auth import verify_password, get_password_hash
        if not verify_password(update_data.current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="La contraseña actual es incorrecta",
            )
        current_user.password_hash = get_password_hash(update_data.new_password)

    session.add(current_user)
    session.commit()
    session.refresh(current_user)
    return current_user


@app.get("/users/search", response_model=List[UserSearchResult])
def search_users(
    q: str = Query(..., min_length=1, description="Texto a buscar en el nombre"),
    trip_id: int | None = Query(None, description="Si se envía, se excluyen quienes ya están en el viaje"),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[UserSearchResult]:
    """Busca usuarios registrados por nombre (coincidencia parcial, sin distinguir mayúsculas)."""
    term = q.strip()
    if len(term) < 2:
        return []

    pattern = f"%{term.lower()}%"
    stmt = (
        select(User)
        .where(func.lower(User.full_name).like(pattern))
        .where(User.id != current_user.id)
    )
    if trip_id is not None:
        member_ids = session.exec(
            select(TripMember.user_id).where(TripMember.trip_id == trip_id)
        ).all()
        if member_ids:
            stmt = stmt.where(User.id.not_in(member_ids))

    users = session.exec(stmt.limit(20)).all()
    return [
        UserSearchResult(id=u.id, full_name=u.full_name, email=u.email) for u in users
    ]


# ─── Expenses ─────────────────────────────────────────────────────────────────

@app.get("/expenses", response_model=List[ExpenseRead])
def list_expenses(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    limit: int = 50,
    offset: int = 0,
) -> List[Expense]:
    expenses = session.exec(
        select(Expense)
        .where(Expense.user_id == current_user.id)
        .order_by(Expense.created_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return expenses


@app.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    expense_data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Expense:
    rate = 1.0
    currency = expense_data.original_currency.upper()

    if currency != current_user.base_currency.upper():
        rate = await get_ars_conversion_rate(currency)

    base_amount = round(expense_data.original_amount * rate, 2)

    expense = Expense(
        user_id=current_user.id,
        description=expense_data.description,
        category=expense_data.category,
        original_amount=expense_data.original_amount,
        original_currency=currency,
        exchange_rate_used=rate,
        base_amount=base_amount,
        source=ExpenseSource.MANUAL,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@app.post("/expenses/ai", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense_from_ai(
    request: AIExpenseRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Expense:
    try:
        extracted = await ai_service.extract_expense(request.message)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )

    currency = extracted.get("original_currency", "ARS").upper()
    amount = float(extracted.get("original_amount", 0))
    rate = 1.0

    if currency != current_user.base_currency.upper():
        rate = await get_ars_conversion_rate(currency)

    base_amount = round(amount * rate, 2)

    raw_category = extracted.get("category", "Otro")
    try:
        category = ExpenseCategory(raw_category)
    except ValueError:
        category = ExpenseCategory.OTRO

    expense = Expense(
        user_id=current_user.id,
        description=extracted.get("description", request.message[:100]),
        category=category,
        original_amount=amount,
        original_currency=currency,
        exchange_rate_used=rate,
        base_amount=base_amount,
        source=ExpenseSource.WEBCHAT,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@app.get("/expenses/stats", response_model=ExpenseStats)
def get_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExpenseStats:
    now = datetime.utcnow()
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    expenses = session.exec(
        select(Expense).where(
            Expense.user_id == current_user.id,
            Expense.created_at >= start_of_month,
        )
    ).all()

    total_month = round(sum(e.base_amount for e in expenses), 2)
    by_category: dict[str, float] = {}
    for expense in expenses:
        cat = expense.category.value
        by_category[cat] = round(by_category.get(cat, 0) + expense.base_amount, 2)

    return ExpenseStats(
        total_month_base=total_month,
        base_currency=current_user.base_currency,
        by_category=by_category,
        total_expenses=len(expenses),
    )


@app.patch("/expenses/{expense_id}", response_model=ExpenseRead)
async def update_expense(
    expense_id: int,
    update_data: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Expense:
    expense = session.get(Expense, expense_id)
    if not expense or expense.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto no encontrado",
        )

    if update_data.description is not None:
        expense.description = update_data.description.strip()

    if update_data.category is not None:
        expense.category = update_data.category

    amount_changed = update_data.original_amount is not None
    currency_changed = update_data.original_currency is not None

    if amount_changed or currency_changed:
        new_amount = update_data.original_amount if amount_changed else expense.original_amount
        new_currency = update_data.original_currency.upper() if currency_changed else expense.original_currency

        rate = 1.0
        if new_currency != current_user.base_currency.upper():
            rate = await get_ars_conversion_rate(new_currency)

        expense.original_amount = new_amount
        expense.original_currency = new_currency
        expense.exchange_rate_used = rate
        expense.base_amount = round(new_amount * rate, 2)

    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@app.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    expense = session.get(Expense, expense_id)
    if not expense or expense.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto no encontrado",
        )
    session.delete(expense)
    session.commit()


@app.get("/rates")
async def get_rates(current_user: User = Depends(get_current_user)) -> list:
    """Returns current dollar rates from DolarAPI."""
    try:
        return await get_all_rates()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudieron obtener las cotizaciones. Intentá de nuevo.",
        )


# ─── Trip helpers ─────────────────────────────────────────────────────────────

def _get_trip_member(trip_id: int, user_id: str, session: Session) -> TripMember | None:
    return session.exec(
        select(TripMember).where(
            TripMember.trip_id == trip_id, TripMember.user_id == user_id
        )
    ).first()


def _require_trip_access(trip_id: int, user_id: str, session: Session) -> Trip:
    trip = session.get(Trip, trip_id)
    if not trip or not _get_trip_member(trip_id, user_id, session):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Viaje no encontrado")
    return trip


def _build_trip_read(trip: Trip, session: Session) -> TripRead:
    member_count = session.exec(
        select(func.count(TripMember.id)).where(TripMember.trip_id == trip.id)
    ).one()
    total = session.exec(
        select(func.sum(TripExpense.base_amount)).where(TripExpense.trip_id == trip.id)
    ).one() or 0.0
    return TripRead(**trip.model_dump(), member_count=member_count, total_amount=round(total, 2))


def _build_expense_read(expense: TripExpense, session: Session) -> TripExpenseRead:
    paid_by_user = session.get(User, expense.paid_by_id)
    splits_raw = session.exec(
        select(TripExpenseSplit).where(TripExpenseSplit.trip_expense_id == expense.id)
    ).all()
    splits = []
    for s in splits_raw:
        u = session.get(User, s.user_id)
        splits.append(TripExpenseSplitRead(
            user_id=s.user_id, full_name=u.full_name if u else "?", amount=s.amount
        ))
    return TripExpenseRead(
        **expense.model_dump(),
        paid_by_name=paid_by_user.full_name if paid_by_user else "?",
        splits=splits,
    )


def _simplify_debts(balances: list[MemberBalance]) -> list[SettlementTransaction]:
    creditors = sorted(
        [(b.user_id, b.full_name, b.balance) for b in balances if b.balance > 0.01],
        key=lambda x: x[2], reverse=True,
    )
    debtors = sorted(
        [(b.user_id, b.full_name, -b.balance) for b in balances if b.balance < -0.01],
        key=lambda x: x[2], reverse=True,
    )
    transactions: list[SettlementTransaction] = []
    i, j = 0, 0
    while i < len(debtors) and j < len(creditors):
        d_id, d_name, debt = debtors[i]
        c_id, c_name, credit = creditors[j]
        amount = min(debt, credit)
        if amount > 0.01:
            transactions.append(SettlementTransaction(
                from_user_id=d_id, from_user_name=d_name,
                to_user_id=c_id, to_user_name=c_name,
                amount=round(amount, 2),
            ))
        debtors[i]   = (d_id, d_name, round(debt - amount, 2))
        creditors[j] = (c_id, c_name, round(credit - amount, 2))
        if debtors[i][2] < 0.01:   i += 1
        if creditors[j][2] < 0.01: j += 1
    return transactions


def _resolve_trip_payer_from_extract(
    paid_by_raw: str,
    member_users: list[User],
    current_user: User,
) -> User:
    """Interpreta el campo paid_by de la IA ('yo' o nombre de participante)."""
    s = (paid_by_raw or "").strip()
    sl = s.lower()
    if not s or sl in ("yo", "mí", "mi", "yo mismo"):
        return current_user

    for u in member_users:
        if u.full_name.strip().lower() == sl:
            return u

    matches: list[User] = []
    for u in member_users:
        fn = u.full_name.lower()
        if sl in fn or fn.startswith(sl):
            matches.append(u)
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        for u in matches:
            parts = u.full_name.lower().split()
            if parts and parts[0] == sl:
                return u
        return matches[0]

    for u in member_users:
        for token in u.full_name.lower().split():
            if token == sl:
                return u

    names = ", ".join(u.full_name for u in member_users)
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=f"No pude identificar quién pagó ({paid_by_raw!r}). Participantes: {names}",
    )


async def _create_trip_expense_core(
    session: Session,
    trip_id: int,
    trip: Trip,
    paid_by_id: str,
    description: str,
    category: ExpenseCategory,
    original_amount: float,
    original_currency: str,
) -> TripExpense:
    if not _get_trip_member(trip_id, paid_by_id, session):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Quién pagó no es participante del viaje",
        )

    currency = original_currency.upper()
    rate = 1.0
    if currency != trip.currency.upper():
        rate = await get_ars_conversion_rate(currency)
    base_amount = round(original_amount * rate, 2)

    expense = TripExpense(
        trip_id=trip_id,
        paid_by_id=paid_by_id,
        description=description,
        category=category,
        original_amount=original_amount,
        original_currency=currency,
        exchange_rate_used=rate,
        base_amount=base_amount,
    )
    session.add(expense)
    session.flush()

    members = session.exec(select(TripMember).where(TripMember.trip_id == trip_id)).all()
    n = len(members)
    per_person = round(base_amount / n, 2)
    for idx, member in enumerate(members):
        split_amt = per_person if idx < n - 1 else round(base_amount - per_person * (n - 1), 2)
        session.add(
            TripExpenseSplit(
                trip_expense_id=expense.id,
                user_id=member.user_id,
                amount=split_amt,
            )
        )

    session.commit()
    session.refresh(expense)
    return expense


# ─── Trip endpoints ────────────────────────────────────────────────────────────

@app.get("/trips", response_model=list[TripRead])
def list_trips(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TripRead]:
    member_rows = session.exec(
        select(TripMember).where(TripMember.user_id == current_user.id)
    ).all()
    trip_ids = [m.trip_id for m in member_rows]
    if not trip_ids:
        return []
    trips = session.exec(
        select(Trip).where(Trip.id.in_(trip_ids)).order_by(Trip.created_at.desc())
    ).all()
    return [_build_trip_read(t, session) for t in trips]


@app.post("/trips", response_model=TripRead, status_code=status.HTTP_201_CREATED)
def create_trip(
    trip_data: TripCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripRead:
    trip = Trip(**trip_data.model_dump(), created_by=current_user.id)
    session.add(trip)
    session.flush()
    session.add(TripMember(trip_id=trip.id, user_id=current_user.id, role=TripRole.OWNER))
    session.commit()
    session.refresh(trip)
    return _build_trip_read(trip, session)


@app.get("/trips/{trip_id}", response_model=TripDetail)
def get_trip(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripDetail:
    trip = _require_trip_access(trip_id, current_user.id, session)
    members_raw = session.exec(
        select(TripMember).where(TripMember.trip_id == trip_id)
    ).all()
    members = []
    for m in members_raw:
        u = session.get(User, m.user_id)
        if u:
            members.append(TripMemberRead(
                id=m.id, user_id=u.id, full_name=u.full_name,
                email=u.email, role=m.role, joined_at=m.joined_at,
            ))
    expenses_raw = session.exec(
        select(TripExpense).where(TripExpense.trip_id == trip_id)
        .order_by(TripExpense.created_at.desc())
    ).all()
    expenses = [_build_expense_read(e, session) for e in expenses_raw]
    return TripDetail(**trip.model_dump(), members=members, expenses=expenses)


@app.patch("/trips/{trip_id}", response_model=TripRead)
def update_trip(
    trip_id: int,
    update_data: TripUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripRead:
    trip = _require_trip_access(trip_id, current_user.id, session)
    owner = _get_trip_member(trip_id, current_user.id, session)
    if not owner or owner.role != TripRole.OWNER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el organizador puede modificar el viaje")
    for field, value in update_data.model_dump(exclude_none=True).items():
        setattr(trip, field, value)
    session.add(trip)
    session.commit()
    session.refresh(trip)
    return _build_trip_read(trip, session)


@app.post("/trips/{trip_id}/members", response_model=TripMemberRead, status_code=status.HTTP_201_CREATED)
def add_trip_member(
    trip_id: int,
    request: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripMemberRead:
    _require_trip_access(trip_id, current_user.id, session)
    new_user = session.exec(select(User).where(User.email == request.email)).first()
    if not new_user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe un usuario registrado con ese email")
    if _get_trip_member(trip_id, new_user.id, session):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El usuario ya es participante de este viaje")
    member = TripMember(trip_id=trip_id, user_id=new_user.id, role=TripRole.MEMBER)
    session.add(member)
    session.commit()
    session.refresh(member)
    return TripMemberRead(
        id=member.id, user_id=new_user.id, full_name=new_user.full_name,
        email=new_user.email, role=member.role, joined_at=member.joined_at,
    )


@app.delete("/trips/{trip_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_trip_member(
    trip_id: int,
    user_id: str,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    _require_trip_access(trip_id, current_user.id, session)
    owner = _get_trip_member(trip_id, current_user.id, session)
    if not owner or owner.role != TripRole.OWNER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el organizador puede remover participantes")
    if user_id == current_user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El organizador no puede abandonar el viaje")
    member = _get_trip_member(trip_id, user_id, session)
    if not member:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Participante no encontrado")
    session.delete(member)
    session.commit()


@app.post("/trips/{trip_id}/expenses", response_model=TripExpenseRead, status_code=status.HTTP_201_CREATED)
async def add_trip_expense(
    trip_id: int,
    expense_data: TripExpenseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripExpenseRead:
    trip = _require_trip_access(trip_id, current_user.id, session)
    expense = await _create_trip_expense_core(
        session,
        trip_id,
        trip,
        expense_data.paid_by_id,
        expense_data.description,
        expense_data.category,
        expense_data.original_amount,
        expense_data.original_currency,
    )
    return _build_expense_read(expense, session)


@app.post("/trips/{trip_id}/expenses/ai", response_model=TripExpenseRead, status_code=status.HTTP_201_CREATED)
async def add_trip_expense_from_ai(
    trip_id: int,
    request: AIExpenseRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripExpenseRead:
    trip = _require_trip_access(trip_id, current_user.id, session)
    members_rows = session.exec(
        select(TripMember).where(TripMember.trip_id == trip_id)
    ).all()
    member_users: list[User] = []
    for m in members_rows:
        u = session.get(User, m.user_id)
        if u:
            member_users.append(u)

    try:
        extracted = await ai_service.extract_trip_expense(
            request.message,
            [u.full_name for u in member_users],
            current_user.full_name,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    payer = _resolve_trip_payer_from_extract(
        str(extracted.get("paid_by", "")),
        member_users,
        current_user,
    )

    currency = extracted.get("original_currency", "ARS").upper()
    amount = float(extracted.get("original_amount", 0))
    raw_category = extracted.get("category", "Otro")
    try:
        category = ExpenseCategory(raw_category)
    except ValueError:
        category = ExpenseCategory.OTRO

    description = extracted.get("description", request.message[:120]) or "Gasto"

    expense = await _create_trip_expense_core(
        session,
        trip_id,
        trip,
        payer.id,
        description.strip(),
        category,
        amount,
        currency,
    )
    return _build_expense_read(expense, session)


@app.delete("/trips/{trip_id}/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trip_expense(
    trip_id: int,
    expense_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    _require_trip_access(trip_id, current_user.id, session)
    expense = session.get(TripExpense, expense_id)
    if not expense or expense.trip_id != trip_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gasto no encontrado")
    for split in session.exec(
        select(TripExpenseSplit).where(TripExpenseSplit.trip_expense_id == expense_id)
    ).all():
        session.delete(split)
    session.delete(expense)
    session.commit()


@app.get("/trips/{trip_id}/settlement", response_model=TripSettlement)
def get_trip_settlement(
    trip_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TripSettlement:
    trip = _require_trip_access(trip_id, current_user.id, session)
    members_raw = session.exec(select(TripMember).where(TripMember.trip_id == trip_id)).all()

    balances: dict[str, dict] = {}
    for m in members_raw:
        u = session.get(User, m.user_id)
        if u:
            balances[m.user_id] = {"user_id": u.id, "full_name": u.full_name, "paid": 0.0, "owed": 0.0}

    expenses_raw = session.exec(select(TripExpense).where(TripExpense.trip_id == trip_id)).all()
    total = 0.0
    for exp in expenses_raw:
        total += exp.base_amount
        if exp.paid_by_id in balances:
            balances[exp.paid_by_id]["paid"] += exp.base_amount
        for split in session.exec(
            select(TripExpenseSplit).where(TripExpenseSplit.trip_expense_id == exp.id)
        ).all():
            if split.user_id in balances:
                balances[split.user_id]["owed"] += split.amount

    balance_list = [
        MemberBalance(
            user_id=b["user_id"], full_name=b["full_name"],
            paid=round(b["paid"], 2), owed=round(b["owed"], 2),
            balance=round(b["paid"] - b["owed"], 2),
        )
        for b in balances.values()
    ]
    return TripSettlement(
        currency=trip.currency,
        total_expenses=round(total, 2),
        balances=balance_list,
        transactions=_simplify_debts(balance_list),
    )


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "service": "FinTrack AI"}
