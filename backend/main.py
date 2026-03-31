import calendar
from datetime import date, datetime
from typing import List, Optional, Tuple

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
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
from exchange_service import (
    convert_original_to_base,
    get_all_rates,
    get_ars_conversion_rate,
    get_usd_cripto_ars_rate,
)
from models import (
    AddMemberRequest,
    AIChatTurn,
    AIExpenseRequest,
    AIExpenseResult,
    BudgetSummary,
    CreditCardBankDetail,
    CreditCardBankMonthRow,
    CreditCardBreakdown,
    CreditCardCutoffOverride,
    CreditCardCutoffOverrideRead,
    CreditCardCutoffUpsertBody,
    CreditCardPeriodPaid,
    CreditCardPeriodPaidBody,
    CreditCardPurchaseLine,
    Expense,
    ExpenseCategory,
    ExpenseCreate,
    ExpenseRead,
    ExpenseSource,
    ExpenseStats,
    ExpenseUpdate,
    PaymentMethod,
    ExtraIncome,
    ExtraIncomeCreate,
    ExtraIncomeRead,
    FixedExpense,
    FixedExpenseCreate,
    FixedExpensePeriodPaidBody,
    FixedExpensePeriodPayment,
    FixedExpenseRead,
    FixedExpenseUpdate,
    MemberBalance,
    MonthlyBudget,
    MonthlyBudgetRead,
    MonthlyBudgetUpsert,
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
    CreditCardBankEntry,
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


def _validate_year_month(year: int, month: int) -> None:
    if month < 1 or month > 12:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mes debe estar entre 1 y 12",
        )
    if year < 2000 or year > 2100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Año no válido",
        )


def _validate_due_day(value: Optional[int]) -> None:
    if value is None:
        return
    if value < 1 or value > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El día de vencimiento debe estar entre 1 y 31",
        )


def _validate_cut_day(value: Optional[int]) -> None:
    if value is None:
        return
    if value < 1 or value > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El día de corte debe estar entre 1 y 31",
        )


def _nth_weekday_of_month_date(year: int, month: int, weekday: int, nth: int) -> Optional[date]:
    """Devuelve la fecha de la N-ésima ocurrencia de weekday en el mes (1..5)."""
    if weekday < 0 or weekday > 6 or nth < 1 or nth > 5:
        return None
    last = calendar.monthrange(year, month)[1]
    count = 0
    for day in range(1, last + 1):
        d = date(year, month, day)
        if d.weekday() == weekday:
            count += 1
            if count == nth:
                return d
    return None


def _cut_date_for_month(cfg: Optional[CreditCardBankEntry], year: int, month: int) -> Optional[date]:
    """
    Fecha de corte del mes para un banco.
    - none: sin corte (legacy)
    - calendar: día del mes (cut_day)
    - weekday: N-ésimo día de semana hábil (ej. 3er jueves del mes; lun–vie)
    Nota: días hábiles = lun–vie; no considera feriados.
    """
    if not cfg:
        return None
    mode = str(getattr(cfg, "cut_mode", "none") or "none").strip().lower()
    if mode in ("", "none", "null"):
        return None
    if mode == "calendar":
        cd = getattr(cfg, "cut_day", None)
        if cd is None:
            return None
        try:
            d_int = int(cd)
        except (TypeError, ValueError):
            return None
        if d_int < 1 or d_int > 31:
            return None
        last = calendar.monthrange(year, month)[1]
        return date(year, month, min(d_int, last))
    if mode == "weekday":
        wd = getattr(cfg, "cut_weekday", None)
        nth = getattr(cfg, "cut_weekday_nth", None)
        if wd is None or nth is None:
            return None
        try:
            wd_i = int(wd)
            nth_i = int(nth)
        except (TypeError, ValueError):
            return None
        d = _nth_weekday_of_month_date(year, month, wd_i, nth_i)
        if not d:
            return None
        if d.weekday() >= 5:
            return None
        return d
    return None


def _cc_cutoff_overrides_map(session: Session, user_id: str) -> dict[tuple[str, int, int], date]:
    """(bank, year, month) -> cut_date."""
    rows = session.exec(
        select(CreditCardCutoffOverride).where(CreditCardCutoffOverride.user_id == user_id)
    ).all()
    out: dict[tuple[str, int, int], date] = {}
    for r in rows:
        key = ((r.bank or "").strip(), int(r.year), int(r.month))
        if not key[0]:
            continue
        out[key] = r.cut_date
    return out


def _cc_first_installment_start_month(
    e: Expense,
    *,
    cfg_by_name: dict[str, CreditCardBankEntry],
    cutoff_overrides: dict[tuple[str, int, int], date],
) -> tuple[int, int]:
    """
    Determina (año, mes) del periodo de la primera cuota para una compra.
    Regla:
    - si compra <= corte => mes+1
    - si compra >  corte => mes+2
    Corte: override mensual si existe; si no, regla del banco; si no, legacy (mes+1).
    """
    sy, sm = e.created_at.year, e.created_at.month
    bank = (e.credit_card_bank or "").strip()
    if not bank:
        return _add_months(sy, sm, 1)

    cut = cutoff_overrides.get((bank, sy, sm))
    if cut is None:
        cfg = cfg_by_name.get(bank)
        cut = _cut_date_for_month(cfg, sy, sm)

    delta_first = 1 if cut is None or e.created_at.date() <= cut else 2
    return _add_months(sy, sm, delta_first)


def _parse_credit_card_banks_from_stored(raw: object) -> List[CreditCardBankEntry]:
    """Normaliza JSON: legado list[str], list[{name, due_day}], o con due_mode/business_nth."""
    if not raw:
        return []
    if not isinstance(raw, list):
        return []
    seen: set[str] = set()
    out: List[CreditCardBankEntry] = []
    for item in raw:
        if isinstance(item, str):
            name = item.strip()
            if not name or len(name) > 64:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append(
                CreditCardBankEntry(
                    name=name,
                    due_mode="calendar",
                    due_day=None,
                    business_nth=None,
                    cut_mode="none",
                    cut_day=None,
                    cut_weekday=None,
                    cut_weekday_nth=None,
                )
            )
        elif isinstance(item, dict):
            name = (item.get("name") or "").strip()
            if not name or len(name) > 64:
                continue
            key = name.lower()
            if key in seen:
                continue
            seen.add(key)
            mode_raw = str(item.get("due_mode") or "calendar").strip().lower()
            if mode_raw not in ("calendar", "business"):
                mode_raw = "calendar"
            dd = item.get("due_day")
            due: Optional[int] = None
            if dd is not None:
                try:
                    di = int(dd)
                    if 1 <= di <= 31:
                        due = di
                except (TypeError, ValueError):
                    pass
            bn_raw = item.get("business_nth")
            business_nth: Optional[int] = None
            if bn_raw is not None:
                try:
                    bi = int(bn_raw)
                    if 1 <= bi <= 23:
                        business_nth = bi
                except (TypeError, ValueError):
                    pass

            cut_mode_raw = str(item.get("cut_mode") or "none").strip().lower()
            if cut_mode_raw not in ("none", "calendar", "weekday"):
                cut_mode_raw = "none"
            cut_day_raw = item.get("cut_day")
            cut_day: Optional[int] = None
            if cut_day_raw is not None:
                try:
                    ci = int(cut_day_raw)
                    if 1 <= ci <= 31:
                        cut_day = ci
                except (TypeError, ValueError):
                    pass
            cut_wd_raw = item.get("cut_weekday")
            cut_weekday: Optional[int] = None
            if cut_wd_raw is not None:
                try:
                    wi = int(cut_wd_raw)
                    if 0 <= wi <= 6:
                        cut_weekday = wi
                except (TypeError, ValueError):
                    pass
            cut_nth_raw = item.get("cut_weekday_nth")
            cut_weekday_nth: Optional[int] = None
            if cut_nth_raw is not None:
                try:
                    ni = int(cut_nth_raw)
                    if 1 <= ni <= 4:
                        cut_weekday_nth = ni
                except (TypeError, ValueError):
                    pass

            if cut_mode_raw == "calendar":
                cut_weekday = None
                cut_weekday_nth = None
            elif cut_mode_raw == "weekday":
                cut_day = None
                if cut_weekday is None or cut_weekday_nth is None or cut_weekday >= 5:
                    cut_mode_raw = "none"
                    cut_weekday = None
                    cut_weekday_nth = None
            else:
                cut_day = None
                cut_weekday = None
                cut_weekday_nth = None

            if mode_raw == "business" and business_nth is not None:
                out.append(
                    CreditCardBankEntry(
                        name=name,
                        due_mode="business",
                        due_day=None,
                        business_nth=business_nth,
                        cut_mode=cut_mode_raw,
                        cut_day=cut_day,
                        cut_weekday=cut_weekday,
                        cut_weekday_nth=cut_weekday_nth,
                    )
                )
            else:
                out.append(
                    CreditCardBankEntry(
                        name=name,
                        due_mode="calendar",
                        due_day=due,
                        business_nth=None,
                        cut_mode=cut_mode_raw,
                        cut_day=cut_day,
                        cut_weekday=cut_weekday,
                        cut_weekday_nth=cut_weekday_nth,
                    )
                )
        if len(out) >= 40:
            break
    return out


def _normalize_credit_card_banks_for_storage(
    entries: Optional[List[CreditCardBankEntry]],
) -> List[dict]:
    """Lista de dicts para guardar en JSON (sin duplicados por nombre)."""
    if not entries:
        return []
    seen: set[str] = set()
    out: List[dict] = []
    for e in entries:
        name = (e.name or "").strip()
        if not name or len(name) > 64:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        mode = str(e.due_mode or "calendar").strip().lower()
        if mode not in ("calendar", "business"):
            mode = "calendar"
        if mode == "business":
            bn = e.business_nth
            if bn is not None and (bn < 1 or bn > 23):
                bn = None
            base = {"name": name, "due_mode": "business", "due_day": None, "business_nth": bn}
        else:
            due = e.due_day
            if due is not None and (due < 1 or due > 31):
                due = None
            base = {"name": name, "due_mode": "calendar", "due_day": due, "business_nth": None}

        cut_mode = str(getattr(e, "cut_mode", "none") or "none").strip().lower()
        if cut_mode not in ("none", "calendar", "weekday"):
            cut_mode = "none"
        cut_day = getattr(e, "cut_day", None)
        if cut_day is not None and (cut_day < 1 or cut_day > 31):
            cut_day = None
        cut_weekday = getattr(e, "cut_weekday", None)
        if cut_weekday is not None and (cut_weekday < 0 or cut_weekday > 6):
            cut_weekday = None
        cut_weekday_nth = getattr(e, "cut_weekday_nth", None)
        if cut_weekday_nth is not None and (cut_weekday_nth < 1 or cut_weekday_nth > 4):
            cut_weekday_nth = None

        if cut_mode == "calendar":
            cut_weekday = None
            cut_weekday_nth = None
            _validate_cut_day(cut_day)
        elif cut_mode == "weekday":
            cut_day = None
            if cut_weekday is None or cut_weekday_nth is None or cut_weekday >= 5:
                cut_mode = "none"
                cut_weekday = None
                cut_weekday_nth = None
        else:
            cut_day = None
            cut_weekday = None
            cut_weekday_nth = None

        base.update(
            {
                "cut_mode": cut_mode,
                "cut_day": cut_day,
                "cut_weekday": cut_weekday,
                "cut_weekday_nth": cut_weekday_nth,
            }
        )
        out.append(base)
        if len(out) >= 40:
            break
    return out


def user_to_read(user: User) -> UserRead:
    return UserRead(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        base_currency=user.base_currency,
        credit_card_banks=_parse_credit_card_banks_from_stored(user.credit_card_banks),
        created_at=user.created_at,
    )


def _normalize_credit_card_bank_value(bank: Optional[str]) -> Optional[str]:
    if bank is None:
        return None
    s = bank.strip()
    if not s:
        return None
    if len(s) > 128:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre del banco no puede superar 128 caracteres",
        )
    return s


def _validate_expense_credit_card(
    current_user: User,
    payment_method: PaymentMethod,
    credit_card_bank: Optional[str],
) -> Optional[str]:
    """Devuelve el banco normalizado para guardar, o None."""
    normalized = _normalize_credit_card_bank_value(credit_card_bank)
    if payment_method != PaymentMethod.TARJETA_CREDITO:
        if normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El banco solo aplica cuando el medio de pago es Tarjeta de crédito",
            )
        return None
    configured = _parse_credit_card_banks_from_stored(
        getattr(current_user, "credit_card_banks", None) or []
    )
    configured_names = [e.name for e in configured]
    if configured_names:
        if not normalized:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Indicá de qué banco es la tarjeta. "
                    f"Bancos disponibles en tu cuenta: {', '.join(configured_names)}."
                ),
            )
        if normalized not in configured_names:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Ese banco no está en tu lista. "
                    f"Bancos disponibles: {', '.join(configured_names)}."
                ),
            )
        return normalized
    return normalized


def _payment_methods_for_ai() -> str:
    """Texto exacto de cada enum para el prompt de IA."""
    return "\n".join(f"- {pm.value}" for pm in PaymentMethod)


def _payment_methods_invalid_detail() -> str:
    opts = " | ".join(pm.value for pm in PaymentMethod)
    return f"Medio de pago no reconocido. Opciones válidas: {opts}."


def _parse_payment_method_from_ai_strict(raw: object) -> PaymentMethod:
    if raw is None:
        return PaymentMethod.OTRO
    if not isinstance(raw, str):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_payment_methods_invalid_detail(),
        )
    s = raw.strip()
    try:
        return PaymentMethod(s)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=_payment_methods_invalid_detail(),
        )


def _format_conversation_for_ai(turns: Optional[list[AIChatTurn]]) -> str:
    if not turns:
        return "(sin mensajes previos en esta conversación)"
    lines: list[str] = []
    for t in turns[-24:]:
        role = (t.role or "").strip().lower()
        label = "Usuario" if role == "user" else "Asistente"
        c = (t.content or "").strip().replace("\n", " ")
        if len(c) > 1200:
            c = c[:1200] + "…"
        if c:
            lines.append(f"{label}: {c}")
    return "\n".join(lines) if lines else "(sin mensajes previos en esta conversación)"


def _http_exception_detail_as_str(exc: HTTPException) -> str:
    d = exc.detail
    if isinstance(d, str):
        return d
    if isinstance(d, list):
        parts: list[str] = []
        for item in d:
            if isinstance(item, dict):
                msg = item.get("msg")
                parts.append(str(msg) if msg else str(item))
            else:
                parts.append(str(item))
        return " ".join(parts) if parts else "No se pudo completar la acción."
    return str(d) if d is not None else "No se pudo completar la acción."


def _user_credit_banks_for_ai(current_user: User) -> str:
    configured = _parse_credit_card_banks_from_stored(
        getattr(current_user, "credit_card_banks", None) or []
    )
    if not configured:
        return (
            "(sin bancos de tarjeta cargados; el usuario debe agregarlos en Configuración "
            "para poder registrar gastos con tarjeta de crédito con banco asociado)"
        )
    return "\n".join(f"- {e.name}" for e in configured)


def _recent_expenses_for_ai(session: Session, user_id: str, limit: int = 50) -> str:
    rows = session.exec(
        select(Expense)
        .where(Expense.user_id == user_id)
        .order_by(Expense.created_at.desc())
        .limit(limit)
    ).all()
    lines: list[str] = []
    for e in rows:
        bank = e.credit_card_bank or "—"
        lines.append(
            f"id={e.id} | {e.description} | {e.original_amount} {e.original_currency} | "
            f"{e.category.value} | medio={e.payment_method.value} | "
            f"banco={bank} | cuotas={e.credit_installments} | "
            f"{e.created_at.strftime('%Y-%m-%d %H:%M')}"
        )
    return "\n".join(lines) if lines else "(sin gastos aún)"


def _ai_patch_to_expense_update(patch: dict) -> ExpenseUpdate:
    kwargs = {}
    if "description" in patch and patch["description"] is not None:
        kwargs["description"] = str(patch["description"]).strip()
    if "original_amount" in patch and patch["original_amount"] is not None:
        kwargs["original_amount"] = float(patch["original_amount"])
    if "original_currency" in patch and patch["original_currency"] is not None:
        kwargs["original_currency"] = str(patch["original_currency"]).upper().strip()
    if "category" in patch and patch["category"] is not None:
        raw = patch["category"]
        try:
            kwargs["category"] = ExpenseCategory(str(raw))
        except ValueError:
            kwargs["category"] = ExpenseCategory.OTRO
    if "payment_method" in patch and patch["payment_method"] is not None:
        kwargs["payment_method"] = _parse_payment_method_from_ai_strict(
            patch["payment_method"]
        )
    if "credit_card_bank" in patch:
        v = patch["credit_card_bank"]
        if v is None:
            kwargs["credit_card_bank"] = None
        elif isinstance(v, str):
            kwargs["credit_card_bank"] = v.strip() or None
    if "credit_installments" in patch and patch["credit_installments"] is not None:
        kwargs["credit_installments"] = max(1, min(60, int(patch["credit_installments"])))
    if not kwargs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No se indicó ningún cambio válido para el gasto.",
        )
    return ExpenseUpdate(**kwargs)


async def _apply_expense_update(
    session: Session,
    expense: Expense,
    update_data: ExpenseUpdate,
    current_user: User,
) -> Expense:
    old_bank = expense.credit_card_bank
    unset = update_data.model_dump(exclude_unset=True)

    if update_data.description is not None:
        expense.description = update_data.description.strip()

    if update_data.category is not None:
        expense.category = update_data.category

    if update_data.payment_method is not None:
        expense.payment_method = update_data.payment_method

    amount_changed = update_data.original_amount is not None
    currency_changed = update_data.original_currency is not None

    if amount_changed or currency_changed:
        new_amount = update_data.original_amount if amount_changed else expense.original_amount
        new_currency = update_data.original_currency.upper() if currency_changed else expense.original_currency

        base_amount, rate = await convert_original_to_base(
            new_amount,
            new_currency,
            current_user.base_currency.upper(),
        )

        expense.original_amount = new_amount
        expense.original_currency = new_currency
        expense.exchange_rate_used = rate
        expense.base_amount = base_amount

    final_pm = expense.payment_method
    if "credit_card_bank" in unset:
        proposed_bank = unset["credit_card_bank"]
    elif "payment_method" in unset:
        proposed_bank = (
            old_bank if final_pm == PaymentMethod.TARJETA_CREDITO else None
        )
    else:
        proposed_bank = old_bank
    expense.credit_card_bank = _validate_expense_credit_card(
        current_user, final_pm, proposed_bank
    )

    if final_pm != PaymentMethod.TARJETA_CREDITO or not expense.credit_card_bank:
        expense.credit_installments = 1
    elif update_data.credit_installments is not None:
        expense.credit_installments = max(
            1, min(60, int(update_data.credit_installments))
        )

    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


def _paid_fixed_expense_ids(
    session: Session, user_id: str, year: int, month: int
) -> set[int]:
    rows = session.exec(
        select(FixedExpensePeriodPayment.fixed_expense_id)
        .join(FixedExpense)
        .where(
            FixedExpense.user_id == user_id,
            FixedExpensePeriodPayment.year == year,
            FixedExpensePeriodPayment.month == month,
        )
    ).all()
    return set(rows)


def _normalize_amount_currency(currency: str) -> str:
    c = (currency or "ARS").upper().strip()
    allowed = {"ARS", "USD", "EUR"}
    if c not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Moneda no soportada. Usá ARS, USD o EUR.",
        )
    return c


def _fixed_expense_read(row: FixedExpense, paid_this_period: bool) -> FixedExpenseRead:
    return FixedExpenseRead(
        id=row.id,
        user_id=row.user_id,
        name=row.name,
        amount=row.amount,
        original_amount=getattr(row, "original_amount", None),
        original_currency=getattr(row, "original_currency", None),
        exchange_rate_used=getattr(row, "exchange_rate_used", None),
        is_active=row.is_active,
        due_day=row.due_day,
        created_at=row.created_at,
        paid_this_period=paid_this_period,
    )


def _fixed_is_overdue_in_period(
    row: FixedExpense,
    paid_in_period: bool,
    year: int,
    month: int,
) -> bool:
    """Activo, no pagado en el mes, con día de vencimiento ya pasado (mes calendario = periodo)."""
    if not row.is_active or paid_in_period or row.due_day is None:
        return False
    d = row.due_day
    if d < 1 or d > 31:
        return False
    today = date.today()
    if today.year != year or today.month != month:
        return False
    last = calendar.monthrange(year, month)[1]
    effective = min(d, last)
    return effective < today.day


def _month_bounds_utc(year: int, month: int) -> Tuple[datetime, datetime]:
    start = datetime(year, month, 1, 0, 0, 0, 0)
    if month == 12:
        end = datetime(year + 1, 1, 1, 0, 0, 0, 0)
    else:
        end = datetime(year, month + 1, 1, 0, 0, 0, 0)
    return start, end


def _add_months(year: int, month: int, delta: int) -> Tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


def variable_portion_for_month(e: Expense, year: int, month: int) -> float:
    """
    Monto que cuenta en el mes para presupuesto: compras no tarjeta o 1 cuota en el mes de compra;
    tarjeta en N cuotas reparte base_amount/N en cada mes del plan (desde el mes siguiente a la compra).
    """
    if e.payment_method != PaymentMethod.TARJETA_CREDITO:
        cy, cm = e.created_at.year, e.created_at.month
        if (cy, cm) == (year, month):
            return round(e.base_amount, 2)
        return 0.0
    bank_ok = bool((e.credit_card_bank or "").strip())
    n = max(1, int(e.credit_installments or 1))
    if not bank_ok or n <= 1:
        cy, cm = e.created_at.year, e.created_at.month
        if (cy, cm) == (year, month):
            return round(e.base_amount, 2)
        return 0.0
    # Legacy sin overrides: si no hay mapa de cortes mensual, usa corte "regla" del banco.
    per = e.base_amount / n
    sy, sm = e.created_at.year, e.created_at.month
    bank = (e.credit_card_bank or "").strip()
    cfg_by_name: dict[str, CreditCardBankEntry] = {}
    if e.user and getattr(e.user, "credit_card_banks", None):
        cfg_by_name = {
            b.name: b for b in _parse_credit_card_banks_from_stored(e.user.credit_card_banks)
        }
    cut = _cut_date_for_month(cfg_by_name.get(bank), sy, sm) if bank else None
    delta_first = 1 if cut is None or e.created_at.date() <= cut else 2
    first_y, first_m = _add_months(sy, sm, delta_first)
    for i in range(n):
        # La primera cuota se refleja mes+1 o mes+2 según fecha de corte; luego una por mes.
        y_m, m_m = _add_months(first_y, first_m, i)
        if (y_m, m_m) == (year, month):
            return round(per, 2)
    return 0.0


def _credit_card_paid_map(
    session: Session, user_id: str, year: int, month: int
) -> dict[str, bool]:
    rows = session.exec(
        select(CreditCardPeriodPaid).where(
            CreditCardPeriodPaid.user_id == user_id,
            CreditCardPeriodPaid.year == year,
            CreditCardPeriodPaid.month == month,
        )
    ).all()
    return {r.bank: r.paid for r in rows}


def _credit_card_month_rows_for_period(
    session: Session, user_id: str, year: int, month: int, user: User
) -> List[CreditCardBankMonthRow]:
    expenses = session.exec(select(Expense).where(Expense.user_id == user_id)).all()
    cutoff_overrides = _cc_cutoff_overrides_map(session, user_id)
    by_bank: dict[str, float] = {}
    for e in expenses:
        if e.payment_method != PaymentMethod.TARJETA_CREDITO:
            continue
        bank = (e.credit_card_bank or "").strip()
        if not bank:
            continue
        n = max(1, int(e.credit_installments or 1))
        if n <= 1:
            continue
        cfg_by_name = {
            b.name: b for b in _parse_credit_card_banks_from_stored(user.credit_card_banks)
        }
        first_y, first_m = _cc_first_installment_start_month(
            e, cfg_by_name=cfg_by_name, cutoff_overrides=cutoff_overrides
        )
        per = e.base_amount / n
        portion = 0.0
        for i in range(n):
            y_m, m_m = _add_months(first_y, first_m, i)
            if (y_m, m_m) == (year, month):
                portion = round(per, 2)
                break
        if portion <= 0:
            continue
        by_bank[bank] = round(by_bank.get(bank, 0.0) + portion, 2)
    paid_map = _credit_card_paid_map(session, user_id, year, month)
    cfg_by_name = {
        e.name: e for e in _parse_credit_card_banks_from_stored(user.credit_card_banks)
    }
    rows: List[CreditCardBankMonthRow] = []
    for b, a in sorted(by_bank.items(), key=lambda x: x[0].lower()):
        cfg = cfg_by_name.get(b)
        if cfg and cfg.due_mode == "business" and cfg.business_nth is not None:
            rows.append(
                CreditCardBankMonthRow(
                    bank=b,
                    amount=a,
                    label=f"Pago Tarjeta {b}",
                    paid=paid_map.get(b, False),
                    due_mode="business",
                    due_day=None,
                    business_nth=cfg.business_nth,
                )
            )
        elif cfg and cfg.due_mode == "calendar" and cfg.due_day is not None:
            rows.append(
                CreditCardBankMonthRow(
                    bank=b,
                    amount=a,
                    label=f"Pago Tarjeta {b}",
                    paid=paid_map.get(b, False),
                    due_mode="calendar",
                    due_day=cfg.due_day,
                    business_nth=None,
                )
            )
        else:
            rows.append(
                CreditCardBankMonthRow(
                    bank=b,
                    amount=a,
                    label=f"Pago Tarjeta {b}",
                    paid=paid_map.get(b, False),
                    due_mode=None,
                    due_day=None,
                    business_nth=None,
                )
            )
    return rows


def _credit_card_breakdown(
    session: Session, user_id: str, year: int, month: int, base_currency: str
) -> CreditCardBreakdown:
    expenses = session.exec(select(Expense).where(Expense.user_id == user_id)).all()
    # Config de corte/vencimiento por banco + overrides mensuales (historial).
    user = session.get(User, user_id)
    cfg_by_name = (
        {b.name: b for b in _parse_credit_card_banks_from_stored(user.credit_card_banks)}
        if user and user.credit_card_banks
        else {}
    )
    cutoff_overrides = _cc_cutoff_overrides_map(session, user_id)
    by_bank: dict[str, List[CreditCardPurchaseLine]] = {}
    for e in expenses:
        if e.payment_method != PaymentMethod.TARJETA_CREDITO:
            continue
        bank = (e.credit_card_bank or "").strip()
        if not bank:
            continue
        n = max(1, int(e.credit_installments or 1))
        if n <= 1:
            continue
        sy, sm = e.created_at.year, e.created_at.month
        first_y, first_m = _cc_first_installment_start_month(
            e, cfg_by_name=cfg_by_name, cutoff_overrides=cutoff_overrides
        )
        for i in range(n):
            y_m, m_m = _add_months(first_y, first_m, i)
            if (y_m, m_m) != (year, month):
                continue
            per = round(e.base_amount / n, 2)
            idx = i + 1
            remaining = n - idx
            line = CreditCardPurchaseLine(
                expense_id=e.id,
                description=e.description,
                bank=bank,
                total_base=round(e.base_amount, 2),
                installments=n,
                installment_amount=per,
                current_installment_index=idx,
                installments_remaining_after=remaining,
                purchase_date=e.created_at,
            )
            by_bank.setdefault(bank, []).append(line)

    banks_out: List[CreditCardBankDetail] = []
    for bank in sorted(by_bank.keys(), key=lambda x: x.lower()):
        lines = sorted(by_bank[bank], key=lambda L: L.purchase_date, reverse=True)
        total = round(sum(L.installment_amount for L in lines), 2)
        banks_out.append(
            CreditCardBankDetail(bank=bank, total_due_this_month=total, purchases=lines)
        )
    return CreditCardBreakdown(
        year=year, month=month, base_currency=base_currency, banks=banks_out
    )


@app.on_event("startup")
def on_startup() -> None:
    create_db_and_tables()


# ─── Auth ─────────────────────────────────────────────────────────────────────

@app.post("/auth/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, session: Session = Depends(get_session)) -> UserRead:
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
    return user_to_read(user)


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
def get_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return user_to_read(current_user)


@app.patch("/auth/me", response_model=UserRead)
def update_me(
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserRead:
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

    if update_data.credit_card_banks is not None:
        current_user.credit_card_banks = _normalize_credit_card_banks_for_storage(
            update_data.credit_card_banks
        )

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
    return user_to_read(current_user)


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
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> List[Expense]:
    stmt = select(Expense).where(Expense.user_id == current_user.id)
    if year is not None and month is not None:
        _validate_year_month(year, month)
        start, end = _month_bounds_utc(year, month)
        stmt = stmt.where(
            Expense.created_at >= start,
            Expense.created_at < end,
        )
    expenses = session.exec(
        stmt.order_by(Expense.created_at.desc()).offset(offset).limit(limit)
    ).all()
    return expenses


@app.get("/expenses/preview-base")
async def preview_expense_in_base(
    original_amount: float = Query(..., gt=0),
    original_currency: str = Query(..., min_length=3, max_length=4),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Vista previa del monto en moneda base (misma lógica que al crear el gasto)."""
    currency = original_currency.upper().strip()
    base_amount, rate = await convert_original_to_base(
        original_amount,
        currency,
        current_user.base_currency.upper(),
    )
    return {
        "original_amount": original_amount,
        "original_currency": currency,
        "base_amount": base_amount,
        "base_currency": current_user.base_currency.upper(),
        "exchange_rate_used": rate,
    }


@app.post("/expenses", response_model=ExpenseRead, status_code=status.HTTP_201_CREATED)
async def create_expense(
    expense_data: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Expense:
    currency = expense_data.original_currency.upper()
    base_amount, rate = await convert_original_to_base(
        expense_data.original_amount,
        currency,
        current_user.base_currency.upper(),
    )

    cc_bank = _validate_expense_credit_card(
        current_user,
        expense_data.payment_method,
        expense_data.credit_card_bank,
    )
    if expense_data.payment_method != PaymentMethod.TARJETA_CREDITO or not cc_bank:
        credit_inst = 1
    else:
        credit_inst = max(1, min(60, int(expense_data.credit_installments)))

    expense = Expense(
        user_id=current_user.id,
        description=expense_data.description,
        category=expense_data.category,
        original_amount=expense_data.original_amount,
        original_currency=currency,
        exchange_rate_used=rate,
        base_amount=base_amount,
        source=ExpenseSource.MANUAL,
        payment_method=expense_data.payment_method,
        credit_card_bank=cc_bank,
        credit_installments=credit_inst,
    )
    session.add(expense)
    session.commit()
    session.refresh(expense)
    return expense


@app.post("/expenses/ai", response_model=AIExpenseResult)
async def create_expense_from_ai(
    request: AIExpenseRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> JSONResponse:
    recent = _recent_expenses_for_ai(session, current_user.id)
    pm_block = _payment_methods_for_ai()
    banks_block = _user_credit_banks_for_ai(current_user)
    conv_block = _format_conversation_for_ai(request.conversation_history)
    try:
        parsed = await ai_service.extract_expense_action(
            request.message, recent, pm_block, banks_block, conv_block
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        ) from e

    action = parsed["action"]
    if action == "clarify":
        msg = parsed.get("message") or "¿Podés dar más detalle?"
        body = AIExpenseResult(action="assistant_message", message=msg)
        return JSONResponse(
            content=jsonable_encoder(body),
            status_code=status.HTTP_200_OK,
        )

    if action == "edit":
        eid = int(parsed["expense_id"])
        expense = session.get(Expense, eid)
        if not expense or expense.user_id != current_user.id:
            body = AIExpenseResult(
                action="assistant_message",
                message="No encontré ese gasto o no te pertenece.",
            )
            return JSONResponse(
                content=jsonable_encoder(body),
                status_code=status.HTTP_200_OK,
            )
        patch = parsed["patch"]
        try:
            update_data = _ai_patch_to_expense_update(patch)
            updated = await _apply_expense_update(session, expense, update_data, current_user)
        except HTTPException as exc:
            msg = _http_exception_detail_as_str(exc)
            body = AIExpenseResult(action="assistant_message", message=msg)
            return JSONResponse(
                content=jsonable_encoder(body),
                status_code=status.HTTP_200_OK,
            )
        body = AIExpenseResult(action="updated", expense=updated)
        return JSONResponse(
            content=jsonable_encoder(body),
            status_code=status.HTTP_200_OK,
        )

    if action == "delete":
        eid = int(parsed["expense_id"])
        expense = session.get(Expense, eid)
        if not expense or expense.user_id != current_user.id:
            body = AIExpenseResult(
                action="assistant_message",
                message="No encontré ese gasto o no te pertenece.",
            )
            return JSONResponse(
                content=jsonable_encoder(body),
                status_code=status.HTTP_200_OK,
            )
        body = AIExpenseResult(action="pending_delete", expense=expense)
        return JSONResponse(
            content=jsonable_encoder(body),
            status_code=status.HTTP_200_OK,
        )

    if action != "create":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Acción no reconocida.",
        )

    extracted = parsed["data"]
    try:
        currency = extracted.get("original_currency", "ARS").upper()
        amount = float(extracted.get("original_amount", 0))
        base_amount, rate = await convert_original_to_base(
            amount,
            currency,
            current_user.base_currency.upper(),
        )

        raw_category = extracted.get("category", "Otro")
        try:
            category = ExpenseCategory(raw_category)
        except ValueError:
            category = ExpenseCategory.OTRO

        raw_pm = extracted.get("payment_method", "Otro")
        if not isinstance(raw_pm, str):
            raw_pm = "Otro"
        payment_method = _parse_payment_method_from_ai_strict(raw_pm)

        raw_bank = extracted.get("credit_card_bank")
        bank_str: Optional[str] = None
        if isinstance(raw_bank, str):
            bank_str = raw_bank.strip() or None
        cc_bank = _validate_expense_credit_card(current_user, payment_method, bank_str)

        if payment_method != PaymentMethod.TARJETA_CREDITO or not cc_bank:
            credit_inst = 1
        else:
            ai_inst = extracted.get("credit_installments")
            if ai_inst is None:
                body = AIExpenseResult(
                    action="assistant_message",
                    message=(
                        "¿En cuántas cuotas lo pagaste? "
                        'Podés decir "un solo pago" o el número de cuotas (por ejemplo 3 o 12).'
                    ),
                )
                return JSONResponse(
                    content=jsonable_encoder(body),
                    status_code=status.HTTP_200_OK,
                )
            try:
                credit_inst = max(1, min(60, int(ai_inst)))
            except (TypeError, ValueError):
                credit_inst = 1

        expense = Expense(
            user_id=current_user.id,
            description=extracted.get("description", request.message[:100]),
            category=category,
            original_amount=amount,
            original_currency=currency,
            exchange_rate_used=rate,
            base_amount=base_amount,
            source=ExpenseSource.WEBCHAT,
            payment_method=payment_method,
            credit_card_bank=cc_bank,
            credit_installments=credit_inst,
        )
        session.add(expense)
        session.commit()
        session.refresh(expense)
    except HTTPException as exc:
        msg = _http_exception_detail_as_str(exc)
        body = AIExpenseResult(action="assistant_message", message=msg)
        return JSONResponse(
            content=jsonable_encoder(body),
            status_code=status.HTTP_200_OK,
        )

    body = AIExpenseResult(action="created", expense=expense)
    return JSONResponse(
        content=jsonable_encoder(body),
        status_code=status.HTTP_201_CREATED,
    )


@app.get("/expenses/stats", response_model=ExpenseStats)
def get_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> ExpenseStats:
    if year is None or month is None:
        now = datetime.utcnow()
        y, m = now.year, now.month
    else:
        _validate_year_month(year, month)
        y, m = year, month

    all_user_expenses = session.exec(
        select(Expense).where(Expense.user_id == current_user.id)
    ).all()
    cfg_by_name = {
        b.name: b for b in _parse_credit_card_banks_from_stored(current_user.credit_card_banks)
    }
    cutoff_overrides = _cc_cutoff_overrides_map(session, current_user.id)

    def portion_for(e: Expense) -> float:
        if e.payment_method != PaymentMethod.TARJETA_CREDITO:
            cy, cm = e.created_at.year, e.created_at.month
            return round(e.base_amount, 2) if (cy, cm) == (y, m) else 0.0
        bank_ok = bool((e.credit_card_bank or "").strip())
        n = max(1, int(e.credit_installments or 1))
        if not bank_ok or n <= 1:
            cy, cm = e.created_at.year, e.created_at.month
            return round(e.base_amount, 2) if (cy, cm) == (y, m) else 0.0
        first_y, first_m = _cc_first_installment_start_month(
            e, cfg_by_name=cfg_by_name, cutoff_overrides=cutoff_overrides
        )
        per = e.base_amount / n
        for i in range(n):
            y_m, m_m = _add_months(first_y, first_m, i)
            if (y_m, m_m) == (y, m):
                return round(per, 2)
        return 0.0

    total_month = round(
        sum(portion_for(e) for e in all_user_expenses), 2
    )
    by_category: dict[str, float] = {}
    for expense in all_user_expenses:
        portion = portion_for(expense)
        if portion <= 0:
            continue
        cat = expense.category.value
        by_category[cat] = round(by_category.get(cat, 0) + portion, 2)
    count_nonzero = sum(
        1 for e in all_user_expenses if portion_for(e) > 0
    )
    return ExpenseStats(
        total_month_base=total_month,
        base_currency=current_user.base_currency,
        by_category=by_category,
        total_expenses=count_nonzero,
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
    return await _apply_expense_update(session, expense, update_data, current_user)


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


# ─── Finanzas personales: presupuesto mensual ─────────────────────────────────

@app.get("/finances/summary", response_model=BudgetSummary)
def get_budget_summary(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> BudgetSummary:
    _validate_year_month(year, month)

    budget = session.exec(
        select(MonthlyBudget).where(
            MonthlyBudget.user_id == current_user.id,
            MonthlyBudget.year == year,
            MonthlyBudget.month == month,
        )
    ).first()
    salary = round(budget.salary, 2) if budget else 0.0
    salary_usd = budget.salary_usd if budget else None
    salary_cripto = budget.cripto_rate_used if budget else None

    extras = session.exec(
        select(ExtraIncome).where(
            ExtraIncome.user_id == current_user.id,
            ExtraIncome.year == year,
            ExtraIncome.month == month,
        )
    ).all()
    total_extra = round(sum(e.amount for e in extras), 2)

    fixed_active = session.exec(
        select(FixedExpense).where(
            FixedExpense.user_id == current_user.id,
            FixedExpense.is_active == True,  # noqa: E712
        )
    ).all()
    paid_ids = _paid_fixed_expense_ids(session, current_user.id, year, month)
    total_fixed = round(
        sum(f.amount for f in fixed_active if f.id in paid_ids),
        2,
    )

    all_expenses = session.exec(
        select(Expense).where(Expense.user_id == current_user.id)
    ).all()
    cfg_by_name = {
        b.name: b for b in _parse_credit_card_banks_from_stored(current_user.credit_card_banks)
    }
    cutoff_overrides = _cc_cutoff_overrides_map(session, current_user.id)

    def portion_for(e: Expense) -> float:
        if e.payment_method != PaymentMethod.TARJETA_CREDITO:
            cy, cm = e.created_at.year, e.created_at.month
            return round(e.base_amount, 2) if (cy, cm) == (year, month) else 0.0
        bank_ok = bool((e.credit_card_bank or "").strip())
        n = max(1, int(e.credit_installments or 1))
        if not bank_ok or n <= 1:
            cy, cm = e.created_at.year, e.created_at.month
            return round(e.base_amount, 2) if (cy, cm) == (year, month) else 0.0
        first_y, first_m = _cc_first_installment_start_month(
            e, cfg_by_name=cfg_by_name, cutoff_overrides=cutoff_overrides
        )
        per = e.base_amount / n
        for i in range(n):
            y_m, m_m = _add_months(first_y, first_m, i)
            if (y_m, m_m) == (year, month):
                return round(per, 2)
        return 0.0

    variable_all = round(
        sum(portion_for(e) for e in all_expenses), 2
    )
    cc_rows = _credit_card_month_rows_for_period(
        session, current_user.id, year, month, current_user
    )
    cc_due = round(sum(r.amount for r in cc_rows), 2)
    cc_paid_total = round(sum(r.amount for r in cc_rows if r.paid), 2)
    variable_net = round(variable_all - cc_due + cc_paid_total, 2)

    manual_fixed_paid = total_fixed
    total_fixed_display = round(manual_fixed_paid + cc_paid_total, 2)

    total_income = round(salary + total_extra, 2)
    total_out = round(manual_fixed_paid + variable_net, 2)
    remaining = round(total_income - total_out, 2)

    return BudgetSummary(
        year=year,
        month=month,
        base_currency=current_user.base_currency,
        salary=salary,
        salary_usd=salary_usd,
        salary_cripto_rate_used=salary_cripto,
        total_extra_income=total_extra,
        total_fixed_expenses=total_fixed_display,
        total_variable_expenses=variable_net,
        total_income=total_income,
        total_outflows=total_out,
        remaining=remaining,
        credit_card_monthly_by_bank=cc_rows,
    )


@app.get("/finances/credit-cards/breakdown", response_model=CreditCardBreakdown)
def get_credit_card_breakdown(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CreditCardBreakdown:
    _validate_year_month(year, month)
    return _credit_card_breakdown(
        session, current_user.id, year, month, current_user.base_currency
    )


@app.put("/finances/credit-cards/period-paid", status_code=status.HTTP_204_NO_CONTENT)
def set_credit_card_period_paid(
    body: CreditCardPeriodPaidBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    _validate_year_month(body.year, body.month)
    bank = body.bank.strip()
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indicá el banco",
        )
    existing = session.exec(
        select(CreditCardPeriodPaid).where(
            CreditCardPeriodPaid.user_id == current_user.id,
            CreditCardPeriodPaid.year == body.year,
            CreditCardPeriodPaid.month == body.month,
            CreditCardPeriodPaid.bank == bank,
        )
    ).first()
    if existing:
        existing.paid = body.paid
        session.add(existing)
    else:
        session.add(
            CreditCardPeriodPaid(
                user_id=current_user.id,
                year=body.year,
                month=body.month,
                bank=bank,
                paid=body.paid,
            )
        )
    session.commit()


@app.get("/finances/credit-cards/cutoffs", response_model=List[CreditCardCutoffOverrideRead])
def list_credit_card_cutoffs(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
    bank: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> List[CreditCardCutoffOverrideRead]:
    if year is not None or month is not None:
        if year is None or month is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="year y month deben venir juntos",
            )
        _validate_year_month(year, month)
    q = select(CreditCardCutoffOverride).where(
        CreditCardCutoffOverride.user_id == current_user.id
    )
    if bank:
        b = bank.strip()
        if b:
            q = q.where(CreditCardCutoffOverride.bank == b)
    if year is not None and month is not None:
        q = q.where(CreditCardCutoffOverride.year == year, CreditCardCutoffOverride.month == month)
    rows = session.exec(q.order_by(CreditCardCutoffOverride.year.desc(), CreditCardCutoffOverride.month.desc())).all()
    return [
        CreditCardCutoffOverrideRead(
            id=r.id,
            bank=r.bank,
            year=r.year,
            month=r.month,
            cut_date=r.cut_date,
            created_at=r.created_at,
        )
        for r in rows
    ]


@app.put("/finances/credit-cards/cutoffs", status_code=status.HTTP_204_NO_CONTENT)
def upsert_credit_card_cutoff(
    body: CreditCardCutoffUpsertBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    _validate_year_month(body.year, body.month)
    bank = body.bank.strip()
    if not bank:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Indicá el banco",
        )

    existing = session.exec(
        select(CreditCardCutoffOverride).where(
            CreditCardCutoffOverride.user_id == current_user.id,
            CreditCardCutoffOverride.year == body.year,
            CreditCardCutoffOverride.month == body.month,
            CreditCardCutoffOverride.bank == bank,
        )
    ).first()

    if body.cut_date is None:
        if existing:
            session.delete(existing)
            session.commit()
        return

    try:
        parsed = datetime.strptime(body.cut_date.strip(), "%Y-%m-%d").date()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='cut_date debe tener formato "YYYY-MM-DD"',
        ) from None

    if parsed.year != body.year or parsed.month != body.month:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="cut_date debe pertenecer al mismo año/mes indicado",
        )

    # Clamp por seguridad si el usuario manda un día fuera del mes.
    last = calendar.monthrange(body.year, body.month)[1]
    if parsed.day > last:
        parsed = date(body.year, body.month, last)

    if existing:
        existing.cut_date = parsed
        session.add(existing)
    else:
        session.add(
            CreditCardCutoffOverride(
                user_id=current_user.id,
                year=body.year,
                month=body.month,
                bank=bank,
                cut_date=parsed,
            )
        )
    session.commit()


def _monthly_budget_read_from_row(row: MonthlyBudget) -> MonthlyBudgetRead:
    return MonthlyBudgetRead(
        id=row.id,
        user_id=row.user_id,
        year=row.year,
        month=row.month,
        salary=row.salary,
        salary_usd=row.salary_usd,
        cripto_rate_used=row.cripto_rate_used,
    )


@app.put("/finances/monthly-budget", response_model=MonthlyBudgetRead)
async def upsert_monthly_budget(
    data: MonthlyBudgetUpsert,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MonthlyBudgetRead:
    _validate_year_month(data.year, data.month)
    if data.salary < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El sueldo no puede ser negativo",
        )

    cy = (data.salary_currency or "USD").upper().strip()
    if cy not in ("USD", "ARS"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="salary_currency debe ser USD o ARS",
        )

    salary_usd_stored: Optional[float] = None
    cripto_rate: Optional[float] = None
    base = current_user.base_currency.upper()

    if cy == "USD":
        try:
            cripto_rate = await get_usd_cripto_ars_rate()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="No se pudo obtener la cotización dólar cripto. Intentá de nuevo.",
            )
        usd_amt = round(data.salary, 2)
        salary_usd_stored = usd_amt
        ars_from_cripto = round(usd_amt * cripto_rate, 2)
        if base == "ARS":
            salary_stored = ars_from_cripto
        elif base == "USD":
            salary_stored = usd_amt
        else:
            rate_b = await get_ars_conversion_rate(base)
            salary_stored = round(ars_from_cripto / rate_b, 2)
    else:
        salary_stored = round(data.salary, 2)
        salary_usd_stored = None
        cripto_rate = None

    existing = session.exec(
        select(MonthlyBudget).where(
            MonthlyBudget.user_id == current_user.id,
            MonthlyBudget.year == data.year,
            MonthlyBudget.month == data.month,
        )
    ).first()
    if existing:
        existing.salary = salary_stored
        existing.salary_usd = salary_usd_stored
        existing.cripto_rate_used = cripto_rate
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _monthly_budget_read_from_row(existing)

    row = MonthlyBudget(
        user_id=current_user.id,
        year=data.year,
        month=data.month,
        salary=salary_stored,
        salary_usd=salary_usd_stored,
        cripto_rate_used=cripto_rate,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _monthly_budget_read_from_row(row)


@app.get("/finances/fixed-expenses", response_model=List[FixedExpenseRead])
def list_fixed_expenses(
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    fixed_filter: str = Query(
        "all",
        alias="filter",
        description='all, paid (pagados en el mes) u overdue (vencidos: no pagados y fecha pasada)',
    ),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[FixedExpenseRead]:
    if (year is None) ^ (month is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enviá year y month juntos para ver el estado pagado del mes",
        )
    if year is not None:
        _validate_year_month(year, month)  # type: ignore[arg-type]

    fk = fixed_filter.strip().lower()
    if fk not in ("all", "paid", "overdue"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='filter debe ser "all", "paid" o "overdue"',
        )
    if fk in ("paid", "overdue") and (year is None or month is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Para filtrar por pagados o vencidos enviá year y month",
        )

    rows = list(
        session.exec(
            select(FixedExpense)
            .where(FixedExpense.user_id == current_user.id)
            .order_by(FixedExpense.created_at.asc())
        ).all()
    )

    paid_ids: set[int] = set()
    if year is not None and month is not None:
        paid_ids = _paid_fixed_expense_ids(session, current_user.id, year, month)

    if fk == "paid" and year is not None and month is not None:
        rows = [r for r in rows if r.id in paid_ids]
    elif fk == "overdue" and year is not None and month is not None:
        rows = [
            r
            for r in rows
            if _fixed_is_overdue_in_period(r, r.id in paid_ids, year, month)
        ]

    return [
        _fixed_expense_read(r, r.id in paid_ids if year is not None else False)
        for r in rows
    ]


@app.post(
    "/finances/fixed-expenses",
    response_model=FixedExpenseRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_fixed_expense(
    data: FixedExpenseCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FixedExpense:
    name = data.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre es obligatorio",
        )
    if data.amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El monto no puede ser negativo",
        )
    _validate_due_day(data.due_day)
    curr = _normalize_amount_currency(data.amount_currency)
    base_amt, rate = await convert_original_to_base(
        data.amount,
        curr,
        current_user.base_currency.upper(),
    )
    row = FixedExpense(
        user_id=current_user.id,
        name=name,
        amount=base_amt,
        original_amount=round(data.amount, 2),
        original_currency=curr,
        exchange_rate_used=rate,
        is_active=True,
        due_day=data.due_day,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _fixed_expense_read(row, False)


@app.patch("/finances/fixed-expenses/{fixed_id}", response_model=FixedExpenseRead)
async def update_fixed_expense(
    fixed_id: int,
    data: FixedExpenseUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FixedExpenseRead:
    row = session.get(FixedExpense, fixed_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto fijo no encontrado",
        )
    if data.name is not None:
        n = data.name.strip()
        if not n:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El nombre no puede estar vacío",
            )
        row.name = n
    if data.amount is not None:
        if data.amount < 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="El monto no puede ser negativo",
            )
        if data.amount_currency is not None:
            curr = _normalize_amount_currency(data.amount_currency)
        elif getattr(row, "original_currency", None):
            curr = str(row.original_currency)
        else:
            curr = current_user.base_currency.upper()
        base_amt, rate = await convert_original_to_base(
            data.amount,
            curr,
            current_user.base_currency.upper(),
        )
        row.amount = base_amt
        row.original_amount = round(data.amount, 2)
        row.original_currency = curr
        row.exchange_rate_used = rate
    if data.is_active is not None:
        row.is_active = data.is_active

    payload = data.model_dump(exclude_unset=True)
    if "due_day" in payload:
        d = payload["due_day"]
        if d is None:
            row.due_day = None
        else:
            _validate_due_day(d)
            row.due_day = d

    session.add(row)
    session.commit()
    session.refresh(row)
    return _fixed_expense_read(row, False)


@app.patch(
    "/finances/fixed-expenses/{fixed_id}/paid-period",
    response_model=FixedExpenseRead,
)
def set_fixed_expense_paid_period(
    fixed_id: int,
    body: FixedExpensePeriodPaidBody,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> FixedExpenseRead:
    _validate_year_month(body.year, body.month)
    row = session.get(FixedExpense, fixed_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto fijo no encontrado",
        )

    existing = session.exec(
        select(FixedExpensePeriodPayment).where(
            FixedExpensePeriodPayment.fixed_expense_id == fixed_id,
            FixedExpensePeriodPayment.year == body.year,
            FixedExpensePeriodPayment.month == body.month,
        )
    ).first()

    if body.paid:
        if not existing:
            session.add(
                FixedExpensePeriodPayment(
                    fixed_expense_id=fixed_id,
                    year=body.year,
                    month=body.month,
                )
            )
    else:
        if existing:
            session.delete(existing)

    session.commit()
    session.refresh(row)
    return _fixed_expense_read(row, body.paid)


@app.delete("/finances/fixed-expenses/{fixed_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fixed_expense(
    fixed_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    row = session.get(FixedExpense, fixed_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Gasto fijo no encontrado",
        )
    for p in session.exec(
        select(FixedExpensePeriodPayment).where(
            FixedExpensePeriodPayment.fixed_expense_id == fixed_id
        )
    ).all():
        session.delete(p)
    session.delete(row)
    session.commit()


@app.get("/finances/extra-income", response_model=List[ExtraIncomeRead])
def list_extra_income(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> List[ExtraIncome]:
    _validate_year_month(year, month)
    rows = session.exec(
        select(ExtraIncome)
        .where(
            ExtraIncome.user_id == current_user.id,
            ExtraIncome.year == year,
            ExtraIncome.month == month,
        )
        .order_by(ExtraIncome.created_at.desc())
    ).all()
    return rows


@app.post(
    "/finances/extra-income",
    response_model=ExtraIncomeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_extra_income(
    data: ExtraIncomeCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ExtraIncome:
    _validate_year_month(data.year, data.month)
    desc = data.description.strip()
    if not desc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La descripción es obligatoria",
        )
    if data.amount < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El monto no puede ser negativo",
        )
    curr = _normalize_amount_currency(data.amount_currency)
    base_amt, rate = await convert_original_to_base(
        data.amount,
        curr,
        current_user.base_currency.upper(),
    )
    row = ExtraIncome(
        user_id=current_user.id,
        year=data.year,
        month=data.month,
        description=desc,
        amount=base_amt,
        original_amount=round(data.amount, 2),
        original_currency=curr,
        exchange_rate_used=rate,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@app.delete("/finances/extra-income/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_extra_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    row = session.get(ExtraIncome, income_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ingreso extra no encontrado",
        )
    session.delete(row)
    session.commit()


@app.get("/rates/usd-cripto")
async def get_usd_cripto_quote(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Cotización venta USD dólar cripto (ARS por USD), misma fuente que DolarAPI."""
    try:
        venta = await get_usd_cripto_ars_rate()
        return {"moneda": "USD", "casa": "cripto", "nombre": "Cripto", "venta": venta}
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No se pudo obtener el dólar cripto. Intentá de nuevo.",
        )


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
    base_amount, rate = await convert_original_to_base(
        original_amount,
        currency,
        trip.currency.upper(),
    )

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
