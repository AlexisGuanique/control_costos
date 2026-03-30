import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, List

from sqlalchemy import Column, Enum as SAEnum, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel, Relationship


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    return [e.value for e in enum_cls]


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


class PaymentMethod(str, Enum):
    EFECTIVO = "Efectivo"
    TRANSFERENCIA = "Transferencia"
    TARJETA_CREDITO = "Tarjeta de crédito"
    TARJETA_DEBITO = "Tarjeta de débito"
    MERCADOPAGO = "Mercado Pago / QR"
    OTRO = "Otro"


class User(SQLModel, table=True):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True
    )
    email: str = Field(unique=True, index=True)
    password_hash: str
    full_name: str
    base_currency: str = Field(default="ARS")
    credit_card_banks: List[str] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Bancos donde el usuario tiene tarjeta de crédito (para asociar gastos).",
    )
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
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.OTRO,
        sa_column=Column(
            SAEnum(
                PaymentMethod,
                values_callable=_enum_values,
                native_enum=False,
                length=64,
            ),
        ),
    )
    credit_card_bank: Optional[str] = Field(
        default=None,
        max_length=128,
        description="Banco de la tarjeta (solo si el medio es Tarjeta de crédito).",
    )
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
    credit_card_banks: List[str] = Field(default_factory=list)
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
    payment_method: PaymentMethod = PaymentMethod.OTRO
    credit_card_bank: Optional[str] = None


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
    payment_method: PaymentMethod
    credit_card_bank: Optional[str] = None
    created_at: datetime


class ExpenseStats(SQLModel):
    total_month_base: float
    base_currency: str
    by_category: dict
    total_expenses: int


class UserUpdate(SQLModel):
    full_name: Optional[str] = None
    base_currency: Optional[str] = None
    credit_card_banks: Optional[List[str]] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class ExpenseUpdate(SQLModel):
    description: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    credit_card_bank: Optional[str] = None


# ─── Presupuesto personal (sueldo, fijos, ingresos extra) ─────────────────────

class MonthlyBudget(SQLModel, table=True):
    """Sueldo base registrado por mes (en moneda base del usuario)."""

    __tablename__ = "monthlybudget"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", name="uq_monthlybudget_user_period"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    year: int
    month: int
    salary: float = Field(default=0.0, description="Monto en moneda base del usuario (presupuesto).")
    salary_usd: Optional[float] = Field(default=None, description="Monto en USD si se cargó en dólares.")
    cripto_rate_used: Optional[float] = Field(
        default=None, description="Venta dólar cripto (ARS por USD) al guardar."
    )


class FixedExpense(SQLModel, table=True):
    """Gastos fijos recurrentes; amount en moneda base del usuario."""

    __tablename__ = "fixedexpense"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    name: str
    amount: float
    original_amount: Optional[float] = Field(
        default=None, description="Monto ingresado antes de convertir a moneda base."
    )
    original_currency: Optional[str] = Field(default=None, max_length=8)
    exchange_rate_used: Optional[float] = Field(
        default=None, description="Tipo efectivo original → base al guardar."
    )
    is_active: bool = Field(default=True)
    due_day: Optional[int] = Field(
        default=None,
        description="Día del mes en que vence (1–31). None = sin fecha fija.",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


class FixedExpensePeriodPayment(SQLModel, table=True):
    """Marca un gasto fijo como pagado en un mes calendario concreto."""

    __tablename__ = "fixedexpenseperiodpayment"
    __table_args__ = (
        UniqueConstraint(
            "fixed_expense_id",
            "year",
            "month",
            name="uq_fixedexpenseperiodpayment_period",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    fixed_expense_id: int = Field(foreign_key="fixedexpense.id", index=True)
    year: int
    month: int
    paid_at: datetime = Field(default_factory=datetime.utcnow)


class ExtraIncome(SQLModel, table=True):
    """Ingresos adicionales al sueldo, por mes calendario; amount en moneda base."""

    __tablename__ = "extraincome"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    year: int
    month: int
    description: str
    amount: float
    original_amount: Optional[float] = Field(default=None)
    original_currency: Optional[str] = Field(default=None, max_length=8)
    exchange_rate_used: Optional[float] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MonthlyBudgetUpsert(SQLModel):
    year: int
    month: int
    salary: float
    salary_currency: str = "USD"
    """USD: convierte con dólar cripto a tu moneda base. ARS: guarda el monto tal cual."""


class MonthlyBudgetRead(SQLModel):
    id: int
    user_id: str
    year: int
    month: int
    salary: float
    salary_usd: Optional[float] = None
    cripto_rate_used: Optional[float] = None


class FixedExpenseCreate(SQLModel):
    name: str
    amount: float
    due_day: Optional[int] = None
    amount_currency: str = "ARS"


class FixedExpenseUpdate(SQLModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    amount_currency: Optional[str] = None
    is_active: Optional[bool] = None
    due_day: Optional[int] = None


class FixedExpenseRead(SQLModel):
    id: int
    user_id: str
    name: str
    amount: float
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate_used: Optional[float] = None
    is_active: bool
    due_day: Optional[int] = None
    created_at: datetime
    paid_this_period: bool = False


class FixedExpensePeriodPaidBody(SQLModel):
    year: int
    month: int
    paid: bool


class ExtraIncomeCreate(SQLModel):
    year: int
    month: int
    description: str
    amount: float
    amount_currency: str = "ARS"


class ExtraIncomeRead(SQLModel):
    id: int
    user_id: str
    year: int
    month: int
    description: str
    amount: float
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    exchange_rate_used: Optional[float] = None
    created_at: datetime


class BudgetSummary(SQLModel):
    year: int
    month: int
    base_currency: str
    salary: float
    salary_usd: Optional[float] = Field(default=None)
    salary_cripto_rate_used: Optional[float] = Field(default=None)
    total_extra_income: float
    total_fixed_expenses: float
    total_variable_expenses: float
    total_income: float
    total_outflows: float
    remaining: float


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
