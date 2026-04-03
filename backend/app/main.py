from fastapi import FastAPI
from app.routes import simulate

app = FastAPI(title="DefComm Shield Backend")


@app.get("/")
def root():
    return {"message": "Backend running"}


app.include_router(simulate.router, prefix="/api")
