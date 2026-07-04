module.exports = {
  apps: [
    {
      name: "atlas-dispatcher",
      cwd: __dirname,
      script: "dist/workers/dispatcher.js",
      interpreter: "node",
      autorestart: true,
      max_memory_restart: "200M",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-scout",
      cwd: __dirname,
      script: "dist/workers/scout.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      interpreter: "node",
      cron_restart: "0 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-quill",
      cwd: __dirname,
      script: "dist/workers/quill.js",
      interpreter: "node",
      cron_restart: "30 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-producer",
      cwd: __dirname,
      script: "dist/workers/producer.js",
      interpreter: "node",
      cron_restart: "45 2 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-results-autopilot",
      cwd: __dirname,
      script: "dist/workers/results-autopilot.js",
      interpreter: "node",
      cron_restart: "15 3 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-ig-puller",
      cwd: __dirname,
      script: "dist/workers/ig-puller.js",
      interpreter: "node",
      cron_restart: "30 3 * * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-weekly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence weekly",
      interpreter: "node",
      cron_restart: "0 23 * * 0",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-monthly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence monthly",
      interpreter: "node",
      cron_restart: "15 23 1 * *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "atlas-lens-quarterly",
      cwd: __dirname,
      script: "dist/workers/lens.js",
      args: "--cadence quarterly",
      interpreter: "node",
      cron_restart: "30 23 1 1,4,7,10 *",
      autorestart: false,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
