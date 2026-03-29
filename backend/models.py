import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlmodel import Field, SQLModel, Relationship


class ExpenseCategory(str, Enum):
    SUPERMERCADO = "Supermercado"
    TRANSPORTE = "Transporte"
    SUSCRIPCIONES = "Suscripciones"
    OCIO = "Ocio"
    SALUD = "Salud"
    OTRO = "Otro"


class ExpenseSource(str, Enum):
    MANUAL = "Manual"
    WEBCHAT = "WebChat"


class User(SQLModel, table=True):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True
    )
    email: str = Field(unique=True, index=True)
    password_hash: str
    full_name: str
    base_currency: str = Field(default="ARS")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    expenses: List["Expense"] = Relationship(back_populates="user")


class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    description: str
    category: ExpenseCategory = Field(default=ExpenseCategory.OTRO)
    original_amount: float
    original_currency: str = Field(default="ARS")
    exchange_rate_used: float = Field(default=1.0)
    base_amount: float
    source: ExpenseSource = Field(default=ExpenseSource.MANUAL)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    user: Optional[User] = Relationship(back_populates="expenses")


# ─── Schemas de Request/Response ──────────────────────────────────────────────

class UserCreate(SQLModel):
    email: str
    password: str
    full_name: str
    base_currency: str = "ARS"


class UserRead(SQLModel):
    id: str
    email: str
    full_name: str
    base_currency: str
    created_at: datetime


class UserSearchResult(SQLModel):
    """Usuario encontrado por nombre (solo cuentas registradas)."""

    id: str
    full_name: str
    email: str


class ExpenseCreate(SQLModel):
    description: str
    category: ExpenseCategory = ExpenseCategory.OTRO
    original_amount: float
    original_currency: str = "ARS"


class AIExpenseRequest(SQLModel):
    message: str


class ExpenseRead(SQLModel):
    id: int
    user_id: str
    description: str
    category: ExpenseCategory
    original_amount: float
    original_currency: str
    exchange_rate_used: float
    base_amount: float
    source: ExpenseSource
    created_at: datetime


class ExpenseStats(SQLModel):
    total_month_base: float
    base_currency: str
    by_category: dict
    total_expenses: int


class UserUpdate(SQLModel):
    full_name: Optional[str] = None
    base_currency: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class ExpenseUpdate(SQLModel):
    description: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None


# ─── Trip models ──────────────────────────────────────────────────────────────

class TripStatus(str, Enum):
    ACTIVO = "Activo"
    COMPLETADO = "Completado"


class TripRole(str, Enum):
    OWNER = "Owner"
    MEMBER = "Member"


class Trip(SQLModel, table=True):
    __tablename__ = "trip"

    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: str = Field(default="ARS")
    status: TripStatus = Field(default=TripStatus.ACTIVO)
    created_by: str = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TripMember(SQLModel, table=True):
    __tablename__ = "tripmember"

    id: Optional[int] = Field(default=None, primary_key=True)
    trip_id: int = Field(foreign_key="trip.id", index=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    role: TripRole = Field(default=TripRole.MEMBER)
    joined_at: datetime = Field(default_factory=datetime.utcnow)


class TripExpense(SQLModel, table=True):
    __tablename__ = "tripexpense"

    id: Optional[int] = Field(default=None, primary_key=True)
    trip_id: int = Field(foreign_key="trip.id", index=True)
    paid_by_id: str = Field(foreign_key="user.id")
    description: str
    category: ExpenseCategory = Field(default=ExpenseCategory.OTRO)
    original_amount: float
    original_currency: str = Field(default="ARS")
    exchange_rate_used: float = Field(default=1.0)
    base_amount: float
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TripExpenseSplit(SQLModel, table=True):
    __tablename__ = "tripexpensesplit"

    id: Optional[int] = Field(default=None, primary_key=True)
    trip_expense_id: int = Field(foreign_key="tripexpense.id", index=True)
    user_id: str = Field(foreign_key="user.id")
    amount: float


# ─── Trip Schemas ─────────────────────────────────────────────────────────────

class TripCreate(SQLModel):
    name: str
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: str = "ARS"


class TripUpdate(SQLModel):
    name: Optional[str] = None
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[TripStatus] = None


class AddMemberRequest(SQLModel):
    email: str


class TripExpenseCreate(SQLModel):
    paid_by_id: str
    description: str
    category: ExpenseCategory = ExpenseCategory.OTRO
    original_amount: float
    original_currency: str = "ARS"


class TripMemberRead(SQLModel):
    id: int
    user_id: str
    full_name: str
    email: str
    role: TripRole
    joined_at: datetime


class TripExpenseSplitRead(SQLModel):
    user_id: str
    full_name: str
    amount: float


class TripExpenseRead(SQLModel):
    id: int
    trip_id: int
    paid_by_id: str
    paid_by_name: str
    description: str
    category: ExpenseCategory
    original_amount: float
    original_currency: str
    exchange_rate_used: float
    base_amount: float
    created_at: datetime
    splits: List[TripExpenseSplitRead]


class TripRead(SQLModel):
    id: int
    name: str
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: str
    status: TripStatus
    created_by: str
    created_at: datetime
    member_count: int
    total_amount: float


class TripDetail(SQLModel):
    id: int
    name: str
    description: Optional[str] = None
    destination: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    currency: str
    status: TripStatus
    created_by: str
    created_at: datetime
    members: List[TripMemberRead]
    expenses: List[TripExpenseRead]


class MemberBalance(SQLModel):
    user_id: str
    full_name: str
    paid: float
    owed: float
    balance: float


class SettlementTransaction(SQLModel):
    from_user_id: str
    from_user_name: str
    to_user_id: str
    to_user_name: str
    amount: float


class TripSettlement(SQLModel):
    currency: str
    total_expenses: float
    balances: List[MemberBalance]
    transactions: List[SettlementTransaction]
