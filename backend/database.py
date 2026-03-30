import os
from typing import Generator

from sqlmodel import SQLModel, create_engine, Session

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


def _sqlite_patch_monthlybudget_columns() -> None:
    """SQLite no aplica columnas nuevas en tablas ya existentes con create_all."""
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(monthlybudget)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "salary_usd" not in cols:
                conn.execute(text("ALTER TABLE monthlybudget ADD COLUMN salary_usd REAL"))
            if "cripto_rate_used" not in cols:
                conn.execute(text("ALTER TABLE monthlybudget ADD COLUMN cripto_rate_used REAL"))
    except Exception:
        return


def _sqlite_patch_fixedexpense_due_day() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(fixedexpense)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "due_day" not in cols:
                conn.execute(text("ALTER TABLE fixedexpense ADD COLUMN due_day INTEGER"))
    except Exception:
        return


def _sqlite_patch_expense_payment_method() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(expense)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "payment_method" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE expense ADD COLUMN payment_method VARCHAR DEFAULT 'Otro'"
                    )
                )
    except Exception:
        return


def _sqlite_patch_user_credit_card_banks() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(user)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "credit_card_banks" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE user ADD COLUMN credit_card_banks TEXT NOT NULL DEFAULT '[]'"
                    )
                )
    except Exception:
        return


def _sqlite_patch_expense_credit_card_bank() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(expense)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "credit_card_bank" not in cols:
                conn.execute(
                    text("ALTER TABLE expense ADD COLUMN credit_card_bank VARCHAR(128)")
                )
    except Exception:
        return


def _sqlite_patch_fixedexpense_fx_cols() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(fixedexpense)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "original_amount" not in cols:
                conn.execute(text("ALTER TABLE fixedexpense ADD COLUMN original_amount REAL"))
            if "original_currency" not in cols:
                conn.execute(text("ALTER TABLE fixedexpense ADD COLUMN original_currency VARCHAR(8)"))
            if "exchange_rate_used" not in cols:
                conn.execute(text("ALTER TABLE fixedexpense ADD COLUMN exchange_rate_used REAL"))
    except Exception:
        return


def _sqlite_patch_extraincome_fx_cols() -> None:
    if "sqlite" not in DATABASE_URL:
        return
    from sqlalchemy import text

    try:
        with engine.begin() as conn:
            r = conn.execute(text("PRAGMA table_info(extraincome)"))
            cols = {row[1] for row in r}
            if not cols:
                return
            if "original_amount" not in cols:
                conn.execute(text("ALTER TABLE extraincome ADD COLUMN original_amount REAL"))
            if "original_currency" not in cols:
                conn.execute(text("ALTER TABLE extraincome ADD COLUMN original_currency VARCHAR(8)"))
            if "exchange_rate_used" not in cols:
                conn.execute(text("ALTER TABLE extraincome ADD COLUMN exchange_rate_used REAL"))
    except Exception:
        return


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    _sqlite_patch_monthlybudget_columns()
    _sqlite_patch_fixedexpense_due_day()
    _sqlite_patch_expense_payment_method()
    _sqlite_patch_user_credit_card_banks()
    _sqlite_patch_expense_credit_card_bank()
    _sqlite_patch_fixedexpense_fx_cols()
    _sqlite_patch_extraincome_fx_cols()


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
