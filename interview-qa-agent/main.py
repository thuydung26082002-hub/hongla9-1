import os
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from greennode_agent_bridge import AgentBaseMemoryEvents
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage
from langgraph.prebuilt import create_react_agent

SYSTEM_PROMPT = """You are an expert technical interview assistant. Your role is to:
1. Answer technical interview questions clearly and thoroughly (Python, algorithms, system design, databases, etc.)
2. Generate interview questions on a given topic when asked
3. Evaluate answers and provide constructive feedback
4. Remember the full conversation so follow-up questions are answered in context

Guidelines:
- Be concise but complete. Use examples and code snippets when helpful.
- If the user asks "give me questions about X", generate 5 well-crafted questions.
- If the user answers a question you posed, evaluate their answer and explain the ideal solution.
- Always respond in the same language the user writes in (Vietnamese or English).
"""

llm = ChatOpenAI(
    api_key=os.environ.get("LLM_API_KEY"),
    base_url=os.environ.get("LLM_BASE_URL"),
    model=os.environ.get("LLM_MODEL", "gpt-4o-mini"),
    temperature=0.7,
)

checkpointer = AgentBaseMemoryEvents(memory_id=os.environ.get("MEMORY_ID"))

agent = create_react_agent(
    llm,
    tools=[],
    checkpointer=checkpointer,
    prompt=SYSTEM_PROMPT,
)

app = FastAPI()


class InvokeRequest(BaseModel):
    query: str = ""


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/invocations")
async def invoke(
    request: InvokeRequest,
    x_greennode_agentbase_user_id: Optional[str] = Header(None),
    x_greennode_agentbase_session_id: Optional[str] = Header(None),
):
    if not x_greennode_agentbase_user_id or not x_greennode_agentbase_session_id:
        raise HTTPException(
            status_code=400,
            detail="Missing required headers: X-GreenNode-AgentBase-User-Id and X-GreenNode-AgentBase-Session-Id",
        )

    config = {
        "configurable": {
            "thread_id": x_greennode_agentbase_session_id,
            "actor_id": x_greennode_agentbase_user_id,
        }
    }
    messages = [HumanMessage(content=request.query)]
    result = await agent.ainvoke({"messages": messages}, config=config)
    return {"response": result["messages"][-1].content}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
