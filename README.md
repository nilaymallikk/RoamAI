# RoamAI

Conversational multi-agent travel planner. Describe a trip in plain language and get live flight status, hotel research, a day-by-day itinerary, and a budget-aware plan.

## Demo

<video src="docs/ROAMAI_DEMO_1.mp4" controls width="100%"></video>

[Download demo video](docs/ROAMAI_DEMO_1.mp4)

## Features

- **Chat UI** — FastAPI + Jinja frontend with browser-local journey history (24h)
- **Multi-agent pipeline** — sequential LangGraph agents for flights → hotels → itinerary → final answer
- **Live flights** — AviationStack route search with city/country → IATA resolution
- **Hotel research** — Tavily web search for stays
- **Memory** — PostgreSQL checkpointer for thread-based conversation state
- **LLM** — Groq (`llama-3.3-70b-versatile`) for itinerary and final response

## Backend architecture

![Backend architecture](docs/backend.png)

**Flow:** user message → `flight_agent` (AviationStack) → `hotel_agent` (Tavily) → `itinerary_agent` (LLM) → `final_agent` (LLM) → structured travel plan.

## Tech stack

| Layer | Stack |
|-------|--------|
| API / UI | FastAPI, Jinja2, vanilla JS/CSS |
| Agents | LangGraph + LangChain |
| LLM | Groq |
| Tools | AviationStack, Tavily |
| State | PostgreSQL (`langgraph-checkpoint-postgres`) |

## Setup

**1. Install**

```bash
pip install -r requirements.txt
# or: uv sync
```

**2. Environment** — create a `.env` in the project root:

```env
GROQ_API_KEY=...
DATABASE_URL=postgresql://user:pass@host:5432/dbname
AVIATIONSTACK_API_KEY=...
TAVILY_API_KEY=...
DEFAULT_ORIGIN_IATA=DEL   # optional
```

**3. Run**

```bash
python app.py
# or: uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Health check: `GET /health`.

**Docker**

```bash
docker build -t roamai .
docker run -p 8000:8000 --env-file .env roamai
```

## API

`POST /api/travel`

```json
{
  "message": "Plan a 7-day Japan trip from Delhi under a mid-range budget",
  "thread_id": null
}
```

Returns `answer`, `flight_results`, `hotel_results`, `itinerary`, `thread_id`, and `llm_calls`.

## Project layout

```
app.py              # FastAPI routes + static UI
backend.py          # LangGraph travel agents
tools/
  flight_tool.py    # AviationStack + IATA resolution
  tavily_tool.py    # Hotel / web search
templates/          # Chat UI
static/             # CSS, JS, images
docs/               # Demo video + architecture diagram
```

## License

MIT — see [LICENSE](LICENSE).
