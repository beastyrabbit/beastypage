module.exports = {
  apps: [
    {
      name: "beastypage-hub",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_ENTRY_REDIRECT: "/"
      }
    },
    {
      name: "beastypage-gatcha",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3001",
        NEXT_ENTRY_REDIRECT: "/gatcha"
      }
    },
    {
      name: "beastypage-stream",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
        NEXT_ENTRY_REDIRECT: "/stream"
      }
    },
    {
      name: "beastypage-collection",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3003",
        NEXT_ENTRY_REDIRECT: "/collection"
      }
    },
    {
      name: "beastypage-personal",
      cwd: "./frontend",
      script: "bun",
      args: "run start",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: "3004",
        NEXT_ENTRY_REDIRECT: "/personal"
      }
    },
    {
      name: "beastypage-renderer",
      cwd: "./backend/renderer_service",
      script: "uv",
      args: "run uvicorn renderer_service.app.main:app --host 0.0.0.0 --port 8001",
      interpreter: "none"
    }
  ]
};
