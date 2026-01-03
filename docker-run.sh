#!/bin/bash

# Default to current directory if not provided
PROJECT_DIR="${1:-$(pwd)}"

echo "Starting Prism-MCP container..."
echo "Mounting project directory: $PROJECT_DIR"
echo "Inside container, this will be available at /projects"

# Run with interactive stdin for MCP communication
docker run -i --rm \
  -v "$PROJECT_DIR:/projects" \
  -e PROJECT_ROOT=/projects \
  prism-mcp
