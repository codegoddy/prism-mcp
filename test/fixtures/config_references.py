# Test file for configuration-based string references
# This simulates FastAPI/Starlette logging configuration

import logging.config

class CorrelationFilter(logging.Filter):
    """Filter that should NOT be flagged as dead - it's referenced in config dict"""
    def filter(self, record):
        record.correlation_id = "test-123"
        return True

class AuthMiddleware:
    """Middleware that is NOT registered - SHOULD be flagged as dead"""
    async def dispatch(self, request, call_next):
        # This dispatch method should be flagged since the class isn't used
        response = await call_next(request)
        return response

class RegisteredMiddleware:
    """Middleware that IS registered via string reference - should NOT be flagged"""
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        return response

# Configuration dictionary with string references to classes
LOGGING_CONFIG = {
    'version': 1,
    'filters': {
        'correlation': {
            'class': 'app.core.logging_config.CorrelationFilter',  # String reference
        }
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'filters': ['correlation']
        }
    }
}

MIDDLEWARE_CONFIG = [
    'app.middleware.RegisteredMiddleware',  # String reference to RegisteredMiddleware
    'app.middleware.security.CorsMiddleware',
]

def cache_response(func):
    """Decorator that exists but is never used - SHOULD be flagged"""
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

def used_decorator(func):
    """Decorator that is actually used - should NOT be flagged"""
    def wrapper(*args, **kwargs):
        return func(*args, **kwargs)
    return wrapper

@used_decorator
def some_endpoint():
    return {"status": "ok"}
