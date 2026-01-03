from fastapi import FastAPI, Depends
from pydantic import BaseModel

app = FastAPI()

class User(BaseModel):
    id: int
    name: str

    class Config:
        orm_mode = True

@app.get("/users")
async def get_users():
    return [{"id": 1, "name": "John Doe"}]

def unused_internal_function():
    return "I am dead"

_private_unused_function = lambda: "I am also dead"

def used_function():
    return "I am alive"

@app.post("/users")
async def create_user(user: User):
    used_function()
    return user
