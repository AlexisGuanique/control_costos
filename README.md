# FinTrack AI 💰

Plataforma de gestión de finanzas personales impulsada por IA con soporte multi-moneda.

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | FastAPI · SQLModel · LangChain · Gemini |
| Frontend | Next.js 14 · TypeScript · Tailwind CSS · Recharts |
| Base de datos | SQLite (volumen Docker persistente) |
| Infraestructura | Docker · Docker Compose |
| Monedas | DolarAPI (cotización dólar blue en tiempo real) |

## Inicio rápido

### 1. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` y completar:
- `GEMINI_API_KEY` → tu clave de [Google AI Studio](https://aistudio.google.com/app/apikey)
- `JWT_SECRET` → una clave secreta larga (ej: `openssl rand -hex 32`)

### 2. Levantar con Docker Compose

```bash
docker compose up --build
```

| Servicio | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |

### 3. Desarrollo local (sin Docker)

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Estructura del proyecto

```
fintrack-root/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── main.py          # Endpoints FastAPI
│   ├── auth.py          # JWT & OAuth2
│   ├── models.py        # SQLModel entities + schemas
│   ├── database.py      # Engine & session
│   ├── ai_service.py    # LangChain + Gemini
│   ├── exchange_service.py  # DolarAPI integration
│   └── requirements.txt
└── frontend/
    ├── app/
    │   ├── page.tsx         # Login / Registro
    │   └── dashboard/
    │       └── page.tsx     # Dashboard principal
    ├── components/
    │   ├── AIChatWidget.tsx  # Chatbot IA flotante
    │   ├── ExpenseTable.tsx  # Tabla de gastos
    │   └── ExpenseForm.tsx   # Formulario manual
    └── lib/
        ├── api.ts   # Cliente HTTP
        └── types.ts # TypeScript types
```

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/auth/register` | Registrar usuario |
| `POST` | `/auth/token` | Login → JWT |
| `GET` | `/auth/me` | Perfil del usuario |
| `GET` | `/expenses` | Listar gastos |
| `POST` | `/expenses` | Crear gasto manual |
| `POST` | `/expenses/ai` | Crear gasto via IA |
| `GET` | `/expenses/stats` | Estadísticas del mes |
| `DELETE` | `/expenses/{id}` | Eliminar gasto |

## Funcionalidades IA

El chatbot acepta lenguaje natural en español argentino:

- `"Gasté 15 lucas en el supermercado"` → ARS 15.000 · Supermercado
- `"Pagué Netflix por 10 dólares"` → USD 10 → convertido a ARS con cotización blue
- `"Uber al trabajo, 2500 mangos"` → ARS 2.500 · Transporte
- `"Me gasté 2 palos en ropa"` → ARS 2.000.000 · Otro
