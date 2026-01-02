class Calculator:
    def __init__(self):
        self.result = 0

    def add(self, a: int, b: int) -> int:
        return a + b

    def subtract(self, a: int, b: int) -> int:
        return a - b

    def multiply(self, a: int, b: int) -> int:
        return a * b

    def divide(self, a: int, b: int) -> int:
        if b == 0:
            raise ValueError("Division by zero")
        return a / b


def factorial(n: int) -> int:
    if n <= 1:
        return 1
    return n * factorial(n - 1)


calculator = Calculator()
print(calculator.add(2, 3))
