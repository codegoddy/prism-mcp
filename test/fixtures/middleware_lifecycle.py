# Test file for middleware lifecycle methods
# These dispatch methods are called by the framework, not by user code

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware class - dispatch is a framework lifecycle method"""
    
    async def dispatch(self, request: Request, call_next):
        # This method is called by Starlette/FastAPI framework
        # Should NOT be flagged as unused even though no direct calls
        print(f"Request: {request.url}")
        response = await call_next(request)
        return response

class CustomFilter:
    """Custom filter class with framework methods"""
    
    def __init__(self):
        self.enabled = True
    
    def __call__(self, request):
        # Framework calls this
        return self.enabled
    
    def process_request(self, request):
        # Django-style middleware method
        return None

class UnusedHelperClass:
    """This class is genuinely unused - SHOULD be flagged"""
    
    def helper_method(self):
        return "unused"

# Simulate app registration - this makes middleware classes "used"
app_middleware = [
    LoggingMiddleware,
    CustomFilter,
]
