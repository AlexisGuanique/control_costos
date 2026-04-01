import uuid
from datetime import date, datetime
from enum import Enum
from typing import Any, List, Literal, Optional

from sqlalchemy import Column, Enum as SAEnum, JSON, UniqueConstraint
from sqlmodel import Field, SQLModel, Relationship


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    return [e.value for e in enum_cls]


class ExpenseCategory(str, Enum):
    COMIDAS = "Comidas"
    SUPERMERCADO = "Supermercado"
    VIAJES = "Viajes"
    SALIDAS = "Salidas"
    AUTO = "Auto"
    BELLEZA = "Belleza"
    DELIVERY = "Delivery"
    DEPORTE = "Deporte"
    EDUCACION = "Educación"
    FAMILIA = "Familia"
    HOGAR = "Hogar"
    OCIO = "Ocio"
    ROPA = "Ropa"
    MASCOTAS = "Mascotas"
    REGALOS = "Regalos"
    SUSCRIPCIONES = "Suscripciones"
    SALUD = "Salud"
    TRANSPORTE = "Transporte"
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


class CreditCardBankEntry(SQLModel):
    """Banco con tarjeta y regla de vencimiento del resumen."""

    name: str = Field(max_length=64)
    due_mode: str = Field(default="calendar", description='"calendar" o "business"')
    due_day: Optional[int] = Field(default=None, ge=1, le=31)
    business_nth: Optional[int] = Field(
        default=None,
        ge=1,
        le=23,
        description="N-ésimo día hábil (lun–vie) del mes.",
    )
    cut_mode: str = Field(
        default="none",
        description="Legado; siempre none. El corte mensual va en CreditCardCutoffOverride.",
    )
    cut_day: Optional[int] = Field(default=None, ge=1, le=31, description="Legado; no usado.")
    cut_weekday: Optional[int] = Field(
        default=None,
        ge=0,
        le=6,
        description="Legado; no usado.",
    )
    cut_weekday_nth: Optional[int] = Field(
        default=None,
        ge=1,
        le=5,
        description="Legado; no usado.",
    )


class User(SQLModel, table=True):
    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True
    )
    email: str = Field(unique=True, index=True)
    password_hash: str
    full_name: str
    base_currency: str = Field(default="ARS")
    credit_card_banks: List[Any] = Field(
        default_factory=list,
        sa_column=Column(JSON),
        description="Lista de {name, due_day?}; admite legado [str, ...].",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)

    expenses: List["Expense"] = Relationship(back_populates="user")


class Expense(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    description: str
    category: ExpenseCategory = Field(
        default=ExpenseCategory.OTRO,
        sa_column=Column(
            SAEnum(
                ExpenseCategory,
                values_callable=_enum_values,
                native_enum=False,
                length=64,
            )
        ),
    )
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
    credit_installments: int = Field(
        default=1,
        ge=1,
        le=60,
        description="Cantidad de cuotas (solo tarjeta de crédito; 1 = un pago).",
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
    credit_card_banks: List[CreditCardBankEntry] = Field(default_factory=list)
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
    credit_installments: int = Field(default=1, ge=1, le=60)


class AIChatTurn(SQLModel):
    """Un turno del chat enviado al modelo para mantener contexto."""

    role: str  # "user" | "assistant"
    content: str


class AIExpenseRequest(SQLModel):
    message: str
    conversation_history: Optional[List[AIChatTurn]] = None


class AIExpenseResult(SQLModel):
    """Respuesta unificada del endpoint POST /expenses/ai (crear, editar, mensaje informativo o borrado pendiente)."""

    action: Literal["created", "updated", "pending_delete", "assistant_message"]
    expense: Optional["ExpenseRead"] = None
    message: Optional[str] = None


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
    credit_installments: int = 1
    created_at: datetime


class ExpenseStats(SQLModel):
    total_month_base: float
    base_currency: str
    by_category: dict
    total_expenses: int


class UserUpdate(SQLModel):
    full_name: Optional[str] = None
    base_currency: Optional[str] = None
    credit_card_banks: Optional[List[CreditCardBankEntry]] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


class ExpenseUpdate(SQLModel):
    description: Optional[str] = None
    category: Optional[ExpenseCategory] = None
    original_amount: Optional[float] = None
    original_currency: Optional[str] = None
    payment_method: Optional[PaymentMethod] = None
    credit_card_bank: Optional[str] = None
    credit_installments: Optional[int] = Field(default=None, ge=1, le=60)


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


class FixedExpenseAmountOverride(SQLModel, table=True):
    """
    Override del monto de un gasto fijo para un mes concreto.
    El monto base del gasto fijo (FixedExpense.amount) no cambia;
    solo se usa este valor para el mes indicado.
    """

    __tablename__ = "fixedexpenseamountoverride"
    __table_args__ = (
        UniqueConstraint(
            "fixed_expense_id",
            "year",
            "month",
            name="uq_fixedexpenseamountoverride_period",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    fixed_expense_id: int = Field(foreign_key="fixedexpense.id", index=True)
    year: int
    month: int
    amount: float = Field(description="Monto en moneda base para este mes.")
    original_amount: Optional[float] = Field(default=None)
    original_currency: Optional[str] = Field(default=None, max_length=8)
    exchange_rate_used: Optional[float] = Field(default=None)
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


class CreditCardPeriodPaid(SQLModel, table=True):
    """Marca el pago de cuotas de tarjeta (por banco) en un mes, como un fijo."""

    __tablename__ = "creditcardperiodpaid"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", "bank", name="uq_cc_period_bank"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    year: int
    month: int
    bank: str = Field(max_length=128)
    paid: bool = Field(default=False)


class CreditCardCutoffOverride(SQLModel, table=True):
    """
    Override mensual de fecha de corte (cierre) por banco/tarjeta.
    Permite que el corte sea variable mes a mes y deja historial.
    """

    __tablename__ = "creditcardcutoffoverride"
    __table_args__ = (
        UniqueConstraint("user_id", "year", "month", "bank", name="uq_cc_cutoff_period_bank"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    year: int
    month: int
    bank: str = Field(max_length=128)
    cut_date: date
    created_at: datetime = Field(default_factory=datetime.utcnow)


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
    # Monto sobrescrito para el mes solicitado (None = usa el monto base).
    override_amount: Optional[float] = None
    override_original_amount: Optional[float] = None
    override_original_currency: Optional[str] = None


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


class CreditCardBankMonthRow(SQLModel):
    """Cuota mensual por banco (para mostrar como “Pago Tarjeta …”)."""

    bank: str
    bank_key: str
    amount: float
    label: str
    paid: bool = False
    due_mode: Optional[str] = None
    due_day: Optional[int] = None
    business_nth: Optional[int] = None
    amount_usd: Optional[float] = None
    currency_group: str = "ARS"


class CreditCardPeriodPaidBody(SQLModel):
    year: int
    month: int
    bank: str = Field(min_length=1, max_length=128)
    paid: bool


class CreditCardCutoffUpsertBody(SQLModel):
    bank: str = Field(min_length=1, max_length=128)
    year: int
    month: int
    cut_date: Optional[str] = Field(
        default=None,
        description='ISO date "YYYY-MM-DD". Si es null, elimina el override.',
    )


class CreditCardCutoffOverrideRead(SQLModel):
    id: int
    bank: str
    year: int
    month: int
    cut_date: date
    created_at: datetime


class CreditCardPurchaseLine(SQLModel):
    expense_id: int
    description: str
    bank: str
    total_base: float
    installments: int
    installment_amount: float
    current_installment_index: int
    installments_remaining_after: int
    purchase_date: datetime
    original_currency: Optional[str] = None
    original_installment_amount: Optional[float] = None
    exchange_rate_used: Optional[float] = None


class CreditCardBankDetail(SQLModel):
    bank: str
    total_due_this_month: float
    purchases: List[CreditCardPurchaseLine] = Field(default_factory=list)
    total_usd_this_month: Optional[float] = None
    total_ars_only: Optional[float] = None


class CreditCardBreakdown(SQLModel):
    year: int
    month: int
    base_currency: str
    banks: List[CreditCardBankDetail] = Field(default_factory=list)


# ─── Vista global de tarjetas (overview) ─────────────────────────────────────

class CreditCardOverviewMonthEntry(SQLModel):
    """Importe de una tarjeta para un mes concreto y si fue pagado."""
    year: int
    month: int
    amount: float
    paid: bool
    amount_usd: Optional[float] = None   # monto en USD si hay compras en divisa ese mes


class CreditCardOverviewPurchase(SQLModel):
    """Compra activa: todavía tiene cuotas en meses no pagados."""
    expense_id: int
    description: str
    purchase_date: datetime
    total_base: float
    installments: int
    amount_per_installment: float
    first_installment_year: int
    first_installment_month: int
    # cuotas que caen en meses aún no pagados (incluyendo el mes actual si no está pagado)
    installments_remaining: int
    amount_remaining: float
    original_currency: Optional[str] = None
    original_amount_per_installment: Optional[float] = None   # cuota en USD
    original_amount_remaining: Optional[float] = None          # total restante en USD


class CreditCardBankOverview(SQLModel):
    bank: str
    total_paid: float          # suma de meses ARS marcados como pagados
    total_remaining: float     # suma de meses ARS sin pagar
    total_paid_usd: Optional[float] = None      # ídem en USD
    total_remaining_usd: Optional[float] = None
    months: List[CreditCardOverviewMonthEntry] = Field(default_factory=list)
    active_purchases: List[CreditCardOverviewPurchase] = Field(default_factory=list)


class CreditCardOverviewResponse(SQLModel):
    base_currency: str
    banks: List[CreditCardBankOverview] = Field(default_factory=list)


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
    credit_card_monthly_by_bank: List[CreditCardBankMonthRow] = Field(default_factory=list)


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
    category: ExpenseCategory = Field(
        default=ExpenseCategory.OTRO,
        sa_column=Column(
            SAEnum(
                ExpenseCategory,
                values_callable=_enum_values,
                native_enum=False,
                length=64,
            )
        ),
    )
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
