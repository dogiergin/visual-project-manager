/*---------------------------------------------------------------------------------------------
*  Copyright (c) Visual Project Manager contributors. All rights reserved.
*  Based on Project Manager by Alessandro Fragnani.
*  Licensed under the GPLv3 License. See License.md in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { ProjectSummary } from "./projectScanner";

/**
 * A deterministic decision. The tag is suggested when:
 *  - ANY of `whenFiles`, `whenDependencies` or `whenKeywords` matches (when at least one of them is given), and
 *  - ALL the `whenTags` were already decided, and
 *  - NONE of the `unlessTags` were decided.
 *
 * `whenFiles`: `*.ext` (any file with this extension), `folder/` (a relative path prefix) or a file name.
 * `whenDependencies`: package/module names (package.json, requirements.txt, pyproject.toml, Python imports).
 *     A trailing `*` matches a prefix: `@aws-sdk/*`.
 * `whenKeywords`: words of the folder name or of the README title (`AI Engineer Program` -> ai, engineer, program).
 *
 * Several rules can produce the same tag: any of them is enough.
 */
export interface TagRule {
    tag: string;
    whenFiles?: string[];
    whenDependencies?: string[];
    whenKeywords?: string[];
    whenTags?: string[];
    unlessTags?: string[];
}

export interface TagDecisions {
    /** what the project is about, the most specific first (the order is the priority) */
    categories: TagRule[];
    /** languages, frameworks, libraries and tools */
    technologies: TagRule[];
    /** at most this many suggestions of each kind, so a project does not get 20 tags */
    limits: { categories: number; technologies: number };
}

// ---------------------------------------------------------------- dependency groups, shared by several rules

const FRONTEND = [ "react", "react-dom", "vue", "@angular/core", "svelte", "solid-js", "astro", "next", "nuxt", "@remix-run/react", "preact", "lit" ];
const BACKEND = [ "express", "fastify", "koa", "@nestjs/core", "hapi", "@hapi/hapi", "django", "flask", "fastapi", "starlette", "tornado", "sanic", "aiohttp", "uvicorn", "gunicorn" ];
const BACKEND_FILES = [ "artisan", "config/routes.rb", "src/main/resources/application.properties", "src/main/resources/application.yml", "manage.py" ];
const MOBILE_CROSS = [ "react-native", "expo", "@capacitor/core", "@ionic/core", "@ionic/react", "@ionic/angular", "nativescript" ];
const DATA_VIZ = [ "matplotlib", "seaborn", "plotly", "bokeh", "altair", "d3", "chart.js", "recharts", "echarts", "@nivo/core", "vega", "pygal" ];
const CLASSIC_ML = [ "sklearn", "scikit-learn", "xgboost", "lightgbm", "catboost", "statsmodels", "imblearn", "optuna" ];
const DEEP_LEARNING = [ "torch", "pytorch", "tensorflow", "keras", "jax", "flax", "torchvision", "pytorch_lightning", "lightning", "@tensorflow/tfjs" ];
const GENERATIVE_AI = [
    "openai", "anthropic", "@anthropic-ai/sdk", "langchain", "langchain-core", "langchain_core", "langchain-openai", "llama_index", "llama-index",
    "llama_cpp", "llama-cpp-python", "ollama", "transformers", "sentence_transformers", "sentence-transformers", "google-generativeai",
    "google.generativeai", "@google/generative-ai", "vllm", "tiktoken", "ai", "@ai-sdk/*", "cohere", "mistralai", "groq", "litellm"
];

export const DEFAULT_TAG_DECISIONS: TagDecisions = {
    limits: { categories: 5, technologies: 8 },

    categories: [
        // ---- domains: they say the most about a project
        { tag: "Event Management", whenKeywords: [ "event", "events", "congress", "conference", "kongre", "etkinlik", "registration", "kayit", "ticket", "ticketing" ] },
        { tag: "E-commerce", whenDependencies: [ "@shopify/*", "woocommerce", "medusa", "@medusajs/*", "saleor", "@stripe/stripe-js" ], whenKeywords: [ "shop", "store", "ecommerce", "e-commerce", "magaza", "cart", "eticaret" ] },
        { tag: "Finance / Trading", whenDependencies: [ "yfinance", "ccxt", "backtrader", "ta", "ta-lib", "talib", "alpaca-trade-api", "quantlib", "zipline", "vectorbt" ], whenKeywords: [ "trading", "finance", "stock", "stocks", "borsa", "crypto", "kripto", "finans" ] },
        { tag: "Competition / Kaggle", whenDependencies: [ "kaggle", "kagglehub" ], whenKeywords: [ "kaggle", "competition", "hackathon", "yarisma" ] },
        { tag: "Education / Course", whenKeywords: [ "course", "bootcamp", "tutorial", "homework", "assignment", "lesson", "lessons", "kurs", "egitim", "ders", "odev", "training", "workshop", "exercises", "practice" ] },
        { tag: "Portfolio / Personal Site", whenKeywords: [ "portfolio", "portfolyo", "resume", "cv", "personal website", "personal site", "blog" ] },
        { tag: "Game Development", whenFiles: [ "project.godot", "*.unity", "*.uproject", "projectsettings/projectversion.txt" ], whenDependencies: [ "pygame", "phaser", "pyglet", "arcade", "ursina", "@babylonjs/core", "kaboom", "excalibur" ], whenKeywords: [ "game", "games", "oyun" ] },
        { tag: "Bot", whenDependencies: [ "discord", "discord.py", "discord.js", "python-telegram-bot", "telegram", "telegraf", "node-telegram-bot-api", "slack_bolt", "@slack/bolt", "tweepy", "aiogram", "whatsapp-web.js" ], whenKeywords: [ "bot", "chatbot" ] },
        { tag: "Blockchain / Web3", whenFiles: [ "*.sol", "hardhat.config.js", "hardhat.config.ts", "truffle-config.js", "foundry.toml", "anchor.toml" ], whenDependencies: [ "web3", "ethers", "hardhat", "@solana/web3.js", "viem", "wagmi" ], whenKeywords: [ "blockchain", "web3", "nft", "smart contract" ] },
        { tag: "Robotics", whenDependencies: [ "rospy", "rclpy", "pybullet", "mujoco" ], whenKeywords: [ "robot", "robotics", "ros", "robotik" ] },
        { tag: "Embedded / IoT", whenFiles: [ "*.ino", "platformio.ini", "sdkconfig", "boot.py" ], whenDependencies: [ "paho-mqtt", "paho", "rpi", "rpi.gpio", "gpiozero", "machine", "adafruit_*", "serial", "pyserial", "mqtt" ], whenKeywords: [ "iot", "arduino", "esp32", "raspberry", "embedded", "gomulu" ] },
        { tag: "Audio / Music", whenDependencies: [ "librosa", "pydub", "soundfile", "pyaudio", "tone", "howler", "music21", "whisper", "openai-whisper" ], whenKeywords: [ "audio", "music", "sound", "muzik", "ses", "speech" ] },
        { tag: "Security", whenDependencies: [ "scapy", "pwntools", "pwn", "impacket", "python-nmap", "nmap" ], whenKeywords: [ "security", "pentest", "ctf", "exploit", "guvenlik", "siber" ], unlessTags: [ "Backend", "Web Development" ] },
        { tag: "Scientific Computing", whenFiles: [ "*.jl" ], whenDependencies: [ "scipy", "sympy", "numba", "astropy", "biopython", "bio", "networkx", "pymc", "cvxpy" ], whenKeywords: [ "simulation", "physics", "math", "bilimsel" ] },

        // ---- platforms
        { tag: "Mobile Development", whenFiles: [ "pubspec.yaml", "androidmanifest.xml", "podfile", "*.xcodeproj" ], whenDependencies: MOBILE_CROSS, whenKeywords: [ "mobile", "android", "ios", "mobil" ] },
        { tag: "Android Development", whenFiles: [ "androidmanifest.xml", "app/src/main/" ], whenKeywords: [ "android" ] },
        { tag: "iOS Development", whenFiles: [ "podfile", "*.xcodeproj", "*.xcworkspace" ], whenKeywords: [ "ios", "iphone", "ipad" ] },
        { tag: "Cross-Platform Mobile", whenFiles: [ "pubspec.yaml" ], whenDependencies: MOBILE_CROSS },
        { tag: "Desktop Application", whenFiles: [ "src-tauri/", "*.xaml" ], whenDependencies: [ "electron", "@tauri-apps/api", "pyside6", "pyside2", "pyqt5", "pyqt6", "tkinter", "customtkinter", "wx", "kivy", "flet", "pywebview" ], whenKeywords: [ "desktop", "masaustu" ] },
        { tag: "Editor Extension", whenDependencies: [ "vscode-engine", "@types/vscode" ], whenKeywords: [ "vscode", "extension", "plugin" ], unlessTags: [ "Web Development" ] },
        { tag: "Browser Extension", whenKeywords: [ "chrome extension", "browser extension", "firefox addon", "web extension" ], whenDependencies: [ "webextension-polyfill", "@types/chrome", "wxt", "plasmo" ] },

        // ---- AI and data, specific to generic
        { tag: "Generative AI", whenDependencies: GENERATIVE_AI, whenKeywords: [ "llm", "gpt", "rag", "genai", "generative ai", "chatgpt", "claude" ] },
        { tag: "AI Agents", whenDependencies: [ "langgraph", "crewai", "autogen", "pyautogen", "@modelcontextprotocol/sdk", "mcp", "smolagents", "agents", "@openai/agents" ], whenKeywords: [ "agent", "agents", "ajan", "mcp" ] },
        { tag: "Computer Vision", whenDependencies: [ "cv2", "opencv-python", "opencv-python-headless", "torchvision", "ultralytics", "mediapipe", "albumentations", "pytesseract", "face_recognition", "skimage", "scikit-image", "timm", "detectron2" ], whenKeywords: [ "vision", "yolo", "goruntu", "ocr" ] },
        { tag: "Natural Language Processing", whenDependencies: [ "nltk", "spacy", "gensim", "textblob", "zeyrek", "stanza", "fasttext" ], whenKeywords: [ "nlp", "sentiment", "dogal dil" ] },
        { tag: "Deep Learning", whenDependencies: DEEP_LEARNING, whenKeywords: [ "deep learning", "neural", "derin ogrenme" ] },
        { tag: "Machine Learning", whenDependencies: [ ...CLASSIC_ML, ...DEEP_LEARNING ], whenKeywords: [ "machine learning", "ml", "makine ogrenmesi" ] },
        { tag: "Data Science", whenTags: [ "Data Analysis", "Machine Learning" ] },
        { tag: "Data Science", whenKeywords: [ "data science", "datascience", "veri bilimi" ] },
        { tag: "Data Engineering", whenFiles: [ "dags/", "dbt_project.yml" ], whenDependencies: [ "airflow", "apache-airflow", "dbt", "dbt-core", "pyspark", "kafka", "kafka-python", "confluent_kafka", "dagster", "prefect", "great_expectations", "luigi", "dask" ], whenKeywords: [ "etl", "pipeline", "data engineering" ] },
        { tag: "Dashboard", whenDependencies: [ "streamlit", "dash", "gradio", "panel", "voila", "shiny" ], whenKeywords: [ "dashboard", "panel" ] },
        { tag: "Data Visualization", whenDependencies: DATA_VIZ, whenKeywords: [ "visualization", "visualisation", "viz", "chart", "charts", "gorsellestirme" ] },
        { tag: "Data Analysis", whenFiles: [ "*.ipynb", "*.csv", "*.xlsx", "*.xls", "*.parquet", "*.tsv", "*.sav", "*.dta" ], whenDependencies: [ "pandas", "polars", "duckdb", "pyjanitor" ], whenKeywords: [ "data", "analysis", "analytics", "analiz", "veri" ], unlessTags: [ "Backend", "Frontend" ] },
        { tag: "Artificial Intelligence", whenKeywords: [ "ai", "artificial intelligence", "yapay zeka", "yz" ] },
        { tag: "Artificial Intelligence", whenTags: [ "Machine Learning" ] },
        { tag: "Artificial Intelligence", whenTags: [ "Generative AI" ] },

        // ---- web
        { tag: "Full Stack", whenTags: [ "Frontend", "Backend" ] },
        { tag: "Frontend", whenDependencies: [ ...FRONTEND, "vite", "tailwindcss", "bootstrap", "jquery" ], whenKeywords: [ "frontend", "front end", "ui" ], unlessTags: [ "Mobile Development", "Editor Extension", "Desktop Application" ] },
        { tag: "Backend", whenFiles: BACKEND_FILES, whenDependencies: BACKEND, whenKeywords: [ "backend", "back end", "server", "sunucu" ] },
        { tag: "API Development", whenFiles: [ "openapi.yaml", "openapi.json", "swagger.json", "swagger.yaml", "*.graphql" ], whenDependencies: [ "fastapi", "@nestjs/core", "graphql", "apollo-server", "@apollo/server", "djangorestframework", "rest_framework", "flask-restful", "hono", "trpc", "@trpc/server" ], whenKeywords: [ "api", "rest", "graphql" ] },
        { tag: "Web Development", whenFiles: BACKEND_FILES, whenDependencies: [ ...FRONTEND, ...BACKEND ], whenKeywords: [ "web", "website", "webapp", "site" ], unlessTags: [ "Mobile Development", "Desktop Application" ] },
        { tag: "Web Development", whenTags: [ "Frontend" ] },

        // ---- tools
        { tag: "Web Scraping", whenDependencies: [ "bs4", "beautifulsoup4", "scrapy", "requests_html", "puppeteer", "cheerio", "crawlee", "selectolax" ], whenKeywords: [ "scraper", "scraping", "crawler", "spider", "kazima" ] },
        { tag: "Automation", whenDependencies: [ "pyautogui", "schedule", "apscheduler", "pywinauto", "keyboard", "pynput", "n8n", "zx" ], whenKeywords: [ "automation", "otomasyon", "script", "scripts" ] },
        { tag: "CLI Tool", whenDependencies: [ "click", "typer", "commander", "yargs", "oclif", "@oclif/core", "inquirer", "fire", "cac", "meow" ], whenKeywords: [ "cli", "command line", "terminal" ] },
        { tag: "Test Automation", whenFiles: [ "cypress/", "cypress.config.js", "cypress.config.ts", "playwright.config.ts", "playwright.config.js" ], whenDependencies: [ "cypress", "@playwright/test", "selenium", "robotframework", "appium", "webdriverio", "behave" ], whenKeywords: [ "test", "tests", "qa", "e2e" ] },

        // ---- infrastructure and the rest
        { tag: "Infrastructure as Code", whenFiles: [ "*.tf", "pulumi.yaml", "ansible.cfg", "cdk.json", "serverless.yml", "serverless.yaml", "*.bicep" ], whenDependencies: [ "aws-cdk-lib", "@pulumi/pulumi", "pulumi" ] },
        { tag: "Cloud", whenFiles: [ "serverless.yml", "cdk.json", "vercel.json", "netlify.toml", "firebase.json", "app.yaml", "wrangler.toml", "amplify/" ], whenDependencies: [ "boto3", "@aws-sdk/*", "aws-sdk", "aws-cdk-lib", "google-cloud-*", "@google-cloud/*", "azure-*", "@azure/*", "firebase-admin" ], whenKeywords: [ "cloud", "aws", "azure", "gcp", "bulut" ] },
        { tag: "DevOps", whenFiles: [ "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml", "*.tf", "ansible.cfg", "helm/", "chart.yaml", "kustomization.yaml", "jenkinsfile" ], whenKeywords: [ "devops", "infra", "infrastructure", "deploy" ] },
        { tag: "Database", whenFiles: [ "*.sql", "prisma/", "schema.prisma", "alembic.ini", "migrations/", "*.sqlite", "*.db" ], whenDependencies: [ "sqlalchemy", "alembic", "prisma", "@prisma/client", "knex", "typeorm", "sequelize", "mongoose", "pymongo", "psycopg2", "psycopg", "pg", "mysql2", "pymysql", "mysql-connector-python", "drizzle-orm", "peewee", "tortoise" ], whenKeywords: [ "database", "db", "sql", "veritabani" ] },
        { tag: "CI/CD", whenFiles: [ ".github/workflows/", ".gitlab-ci.yml", "jenkinsfile", "azure-pipelines.yml", ".circleci/", "bitbucket-pipelines.yml", ".travis.yml" ] },
        { tag: "Monorepo", whenFiles: [ "pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json", "rush.json" ] },
        { tag: "UI Design System", whenFiles: [ ".storybook/" ], whenDependencies: [ "@storybook/*", "storybook" ], whenKeywords: [ "design system", "ui kit", "components" ] },
        { tag: "Documentation", whenFiles: [ "mkdocs.yml", "docusaurus.config.js", "docusaurus.config.ts", "book.toml", "*.tex", "_quarto.yml" ], whenDependencies: [ "@docusaurus/core", "mkdocs", "sphinx", "vitepress" ], whenKeywords: [ "docs", "documentation", "notes", "notlar", "wiki" ] },
        { tag: "Software Development", whenFiles: [ "tsconfig.json", "*.csproj", "*.sln", "go.mod", "cargo.toml", "pom.xml", "build.gradle", "cmakelists.txt", "makefile", "setup.py", "pyproject.toml" ], whenDependencies: [ "vscode-engine" ], unlessTags: [ "Data Analysis", "Machine Learning" ] }
    ],

    technologies: [
        // ---- languages
        { tag: "Python", whenFiles: [ "*.py", "requirements.txt", "pyproject.toml", "pipfile", "setup.py" ], whenDependencies: [ "pandas", "numpy", "ipython", "matplotlib", "sklearn" ] },
        { tag: "TypeScript", whenFiles: [ "tsconfig.json", "*.ts", "*.tsx" ], whenDependencies: [ "typescript" ] },
        { tag: "JavaScript", whenFiles: [ "*.js", "*.jsx", "*.mjs", "*.cjs" ], unlessTags: [ "TypeScript" ] },
        { tag: "Java", whenFiles: [ "*.java", "pom.xml" ] },
        { tag: "Kotlin", whenFiles: [ "*.kt", "*.kts" ] },
        { tag: "Swift", whenFiles: [ "*.swift", "package.swift" ] },
        { tag: "Dart", whenFiles: [ "*.dart" ], unlessTags: [ "Flutter" ] },
        { tag: "C#", whenFiles: [ "*.cs", "*.csproj", "*.sln" ] },
        { tag: "Go", whenFiles: [ "go.mod", "*.go" ] },
        { tag: "Rust", whenFiles: [ "cargo.toml", "*.rs" ] },
        { tag: "PHP", whenFiles: [ "composer.json", "*.php" ] },
        { tag: "Ruby", whenFiles: [ "gemfile", "*.rb" ] },
        { tag: "C/C++", whenFiles: [ "*.c", "*.cpp", "*.cc", "*.hpp", "cmakelists.txt" ] },
        { tag: "R", whenFiles: [ "*.r", "*.rmd", "*.rproj" ] },
        { tag: "Julia", whenFiles: [ "*.jl" ] },
        { tag: "Scala", whenFiles: [ "*.scala", "build.sbt" ] },
        { tag: "Lua", whenFiles: [ "*.lua" ] },
        { tag: "Shell", whenFiles: [ "*.sh", "*.bash" ] },
        { tag: "PowerShell", whenFiles: [ "*.ps1", "*.psm1" ] },
        { tag: "Solidity", whenFiles: [ "*.sol" ] },
        { tag: "SQL", whenFiles: [ "*.sql" ] },
        { tag: "HTML/CSS", whenFiles: [ "*.css", "*.scss", "*.sass", "*.less" ] },
        { tag: "LaTeX", whenFiles: [ "*.tex" ] },

        // ---- notebooks and data files
        { tag: "Jupyter", whenFiles: [ "*.ipynb" ] },
        { tag: "Excel", whenFiles: [ "*.xlsx", "*.xls" ] },
        { tag: "CSV", whenFiles: [ "*.csv" ] },

        // ---- web frameworks
        { tag: "React", whenDependencies: [ "react" ], unlessTags: [ "React Native" ] },
        { tag: "React Native", whenDependencies: [ "react-native" ] },
        { tag: "Expo", whenDependencies: [ "expo" ] },
        { tag: "Next.js", whenDependencies: [ "next" ] },
        { tag: "Vue", whenDependencies: [ "vue" ] },
        { tag: "Nuxt", whenDependencies: [ "nuxt" ] },
        { tag: "Angular", whenDependencies: [ "@angular/core" ] },
        { tag: "Svelte", whenDependencies: [ "svelte" ] },
        { tag: "Astro", whenDependencies: [ "astro" ] },
        { tag: "Remix", whenDependencies: [ "@remix-run/react" ] },
        { tag: "Vite", whenDependencies: [ "vite" ] },
        { tag: "Tailwind CSS", whenFiles: [ "tailwind.config.js", "tailwind.config.ts" ], whenDependencies: [ "tailwindcss" ] },
        { tag: "Bootstrap", whenDependencies: [ "bootstrap" ] },
        { tag: "Express", whenDependencies: [ "express" ] },
        { tag: "NestJS", whenDependencies: [ "@nestjs/core" ] },
        { tag: "Django", whenFiles: [ "manage.py" ], whenDependencies: [ "django" ] },
        { tag: "Flask", whenDependencies: [ "flask" ] },
        { tag: "FastAPI", whenDependencies: [ "fastapi" ] },
        { tag: "Spring", whenFiles: [ "src/main/resources/application.properties", "src/main/resources/application.yml" ] },
        { tag: "Laravel", whenFiles: [ "artisan" ] },
        { tag: "Ruby on Rails", whenFiles: [ "config/routes.rb" ] },
        { tag: "GraphQL", whenFiles: [ "*.graphql" ], whenDependencies: [ "graphql" ] },

        // ---- mobile, desktop, games
        { tag: "Flutter", whenFiles: [ "pubspec.yaml" ] },
        { tag: "Android", whenFiles: [ "androidmanifest.xml", "app/src/main/" ] },
        { tag: "iOS", whenFiles: [ "podfile", "*.xcodeproj" ] },
        { tag: "Electron", whenDependencies: [ "electron" ] },
        { tag: "Tauri", whenFiles: [ "src-tauri/" ], whenDependencies: [ "@tauri-apps/api" ] },
        { tag: "Qt", whenDependencies: [ "pyside6", "pyside2", "pyqt5", "pyqt6" ] },
        { tag: "Tkinter", whenDependencies: [ "tkinter", "customtkinter" ] },
        { tag: "Unity", whenFiles: [ "projectsettings/projectversion.txt", "*.unity" ] },
        { tag: "Godot", whenFiles: [ "project.godot" ] },
        { tag: "Unreal Engine", whenFiles: [ "*.uproject" ] },
        { tag: "Pygame", whenDependencies: [ "pygame" ] },
        { tag: "VS Code Extension", whenDependencies: [ "vscode-engine", "@types/vscode" ] },

        // ---- data and AI libraries
        { tag: "Pandas", whenDependencies: [ "pandas" ] },
        { tag: "NumPy", whenDependencies: [ "numpy" ] },
        { tag: "Matplotlib", whenDependencies: [ "matplotlib", "seaborn" ] },
        { tag: "Plotly", whenDependencies: [ "plotly" ] },
        { tag: "Scikit-learn", whenDependencies: [ "sklearn", "scikit-learn" ] },
        { tag: "PyTorch", whenDependencies: [ "torch", "pytorch" ] },
        { tag: "TensorFlow", whenDependencies: [ "tensorflow", "keras" ] },
        { tag: "Hugging Face", whenDependencies: [ "transformers", "datasets", "huggingface_hub", "huggingface-hub", "diffusers", "@huggingface/*" ] },
        { tag: "OpenCV", whenDependencies: [ "cv2", "opencv-python", "opencv-python-headless" ] },
        { tag: "LangChain", whenDependencies: [ "langchain", "langchain-core", "langchain_core", "langgraph", "@langchain/*" ] },
        { tag: "OpenAI", whenDependencies: [ "openai" ] },
        { tag: "Anthropic", whenDependencies: [ "anthropic", "@anthropic-ai/sdk" ] },
        { tag: "Streamlit", whenDependencies: [ "streamlit" ] },
        { tag: "Gradio", whenDependencies: [ "gradio" ] },
        { tag: "Spark", whenDependencies: [ "pyspark" ] },

        // ---- databases and services
        { tag: "PostgreSQL", whenDependencies: [ "psycopg2", "psycopg", "pg", "asyncpg", "postgres" ] },
        { tag: "MySQL", whenDependencies: [ "mysql2", "pymysql", "mysql-connector-python", "mysqlclient" ] },
        { tag: "MongoDB", whenDependencies: [ "pymongo", "mongoose", "mongodb", "motor" ] },
        { tag: "Redis", whenDependencies: [ "redis", "ioredis" ] },
        { tag: "SQLite", whenFiles: [ "*.sqlite", "*.sqlite3", "*.db" ], whenDependencies: [ "sqlite3", "better-sqlite3" ] },
        { tag: "Prisma", whenFiles: [ "schema.prisma", "prisma/" ], whenDependencies: [ "prisma", "@prisma/client" ] },
        { tag: "Firebase", whenFiles: [ "firebase.json" ], whenDependencies: [ "firebase", "firebase-admin" ] },
        { tag: "Supabase", whenDependencies: [ "@supabase/supabase-js", "supabase" ] },

        // ---- tools
        { tag: "Docker", whenFiles: [ "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yaml" ] },
        { tag: "Kubernetes", whenFiles: [ "chart.yaml", "kustomization.yaml", "k8s/", "helm/" ] },
        { tag: "Terraform", whenFiles: [ "*.tf" ] },
        { tag: "GitHub Actions", whenFiles: [ ".github/workflows/" ] },
        { tag: "Jest", whenDependencies: [ "jest" ] },
        { tag: "Pytest", whenFiles: [ "conftest.py", "pytest.ini" ], whenDependencies: [ "pytest" ] },
        { tag: "Playwright", whenDependencies: [ "@playwright/test", "playwright" ] },
        { tag: "Cypress", whenDependencies: [ "cypress" ] },
        { tag: "Selenium", whenDependencies: [ "selenium" ] },
        { tag: "Arduino", whenFiles: [ "*.ino" ] }
    ]
};

// ---------------------------------------------------------------- evaluation

/** lower case, without accents (ö -> o, ı -> i), words separated by one space */
export function normalizeWords(text: string): string {
    return text
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase -> camel Case
        .replace(/ı/g, "i").replace(/İ/g, "I")
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9#+]+/g, " ")
        .trim();
}

/** the first line of the README (usually `# Project Title`) */
function readmeTitle(readme: string): string {
    const line = readme.split(/\r?\n/).map(item => item.trim()).find(item => item !== "");
    return line ? line.replace(/^#+\s*/, "") : "";
}

function matchesFile(summary: ProjectSummary, pattern: string): boolean {
    const lower = pattern.toLowerCase();
    if (lower.startsWith("*.")) {
        const extension = lower.substring(2);
        return (summary.extensions[ extension ] ?? 0) > 0
            || summary.paths.some(item => item.endsWith(`.${extension}/`)); // folders like `App.xcodeproj`
    }
    if (lower.endsWith("/")) {
        return summary.paths.some(item => item.startsWith(lower) || item.includes(`/${lower}`));
    }
    if (lower.includes("/")) {
        return summary.paths.includes(lower) || summary.paths.some(item => item.endsWith(`/${lower}`));
    }
    return summary.paths.some(item => item === lower || item.endsWith(`/${lower}`));
}

function matchesDependency(dependencies: Set<string>, pattern: string): boolean {
    const lower = pattern.toLowerCase();
    if (lower.endsWith("*")) {
        const prefix = lower.substring(0, lower.length - 1);
        return [ ...dependencies ].some(item => item.startsWith(prefix));
    }
    return dependencies.has(lower);
}

interface EvaluationContext {
    summary: ProjectSummary;
    dependencies: Set<string>;
    words: string; // " word word ", to match whole words
}

function createContext(summary: ProjectSummary): EvaluationContext {
    return {
        summary,
        dependencies: new Set(summary.dependencies.map(item => item.toLowerCase())),
        words: ` ${normalizeWords(`${summary.name} ${readmeTitle(summary.readme)}`)} `
    };
}

function ruleMatches(rule: TagRule, context: EvaluationContext, decided: Set<string>): boolean {
    const hasSignals = !!(rule.whenFiles?.length || rule.whenDependencies?.length || rule.whenKeywords?.length);
    const hasTags = !!rule.whenTags?.length;
    if (!hasSignals && !hasTags) {
        return false;
    }
    if (hasSignals) {
        const signal = (rule.whenFiles ?? []).some(pattern => matchesFile(context.summary, pattern))
            || (rule.whenDependencies ?? []).some(pattern => matchesDependency(context.dependencies, pattern))
            || (rule.whenKeywords ?? []).some(keyword => context.words.includes(` ${normalizeWords(keyword)} `));
        if (!signal) {
            return false;
        }
    }
    if (hasTags && !rule.whenTags.every(tag => decided.has(tag))) {
        return false;
    }
    return !(rule.unlessTags ?? []).some(tag => decided.has(tag));
}

/**
 * First the rules that only look at the project, then the rules that depend on other tags (`whenTags` / `unlessTags`).
 * Returns the tags in rule order (the priority), without duplicates.
 */
function evaluate(context: EvaluationContext, rules: TagRule[], decided: Set<string>): string[] {
    const tags: string[] = [];
    const add = (tag: string) => {
        if (!tags.includes(tag)) {
            tags.push(tag);
        }
        decided.add(tag);
    };

    const dependsOnTags = (rule: TagRule) => !!(rule.whenTags?.length || rule.unlessTags?.length);
    for (const rule of rules ?? []) {
        if (rule && typeof rule.tag === "string" && !dependsOnTags(rule) && ruleMatches(rule, context, decided)) {
            add(rule.tag);
        }
    }
    // a rule can depend on a tag decided by a later rule: repeat until nothing changes
    for (let changed = true, round = 0; changed && round < 5; round++) {
        changed = false;
        for (const rule of rules ?? []) {
            if (rule && typeof rule.tag === "string" && dependsOnTags(rule) && !tags.includes(rule.tag) && ruleMatches(rule, context, decided)) {
                add(rule.tag);
                changed = true;
            }
        }
    }
    // keep the order of the rules (the priority), not the order of the passes
    const order = (rules ?? []).map(rule => rule?.tag);
    return tags.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export function evaluateRules(summary: ProjectSummary, rules: TagRule[]): string[] {
    return evaluate(createContext(summary), rules, new Set());
}

/** Categories first (most specific first), then technologies, each list cut to its limit */
export function decideTags(summary: ProjectSummary, decisions: TagDecisions): { categories: string[]; technologies: string[] } {
    const context = createContext(summary);
    // technologies first: some categories depend on them
    const decided = new Set<string>();
    const technologies = evaluate(context, decisions.technologies, decided);
    const categories = evaluate(context, decisions.categories, decided);
    return {
        categories: categories.slice(0, Math.max(0, decisions.limits.categories)),
        technologies: technologies.slice(0, Math.max(0, decisions.limits.technologies))
    };
}

/** Merges a user decisions file over the defaults, ignoring invalid parts. Also reads the 1.0 format. */
export function mergeDecisions(user: unknown): TagDecisions {
    const merged: TagDecisions = JSON.parse(JSON.stringify(DEFAULT_TAG_DECISIONS));
    if (!user || typeof user !== "object") {
        return merged;
    }
    const value = user as {
        categories?: unknown; technologies?: unknown; limits?: { categories?: unknown; technologies?: unknown };
        rules?: unknown; ollaya?: { fallbackRules?: unknown }; // 1.0 format
    };
    const validRules = (rules: unknown): TagRule[] | undefined =>
        Array.isArray(rules) ? rules.filter(rule => rule && typeof rule.tag === "string") : undefined;

    merged.categories = validRules(value.categories) ?? validRules(value.ollaya?.fallbackRules) ?? merged.categories;
    merged.technologies = validRules(value.technologies) ?? validRules(value.rules) ?? merged.technologies;
    if (value.limits && typeof value.limits === "object") {
        if (typeof value.limits.categories === "number") {
            merged.limits.categories = value.limits.categories;
        }
        if (typeof value.limits.technologies === "number") {
            merged.limits.technologies = value.limits.technologies;
        }
    }
    return merged;
}

/** every tag the decisions can produce (these can be published as GitHub topics) */
export function knownTags(decisions: TagDecisions): string[] {
    return [ ...decisions.categories, ...decisions.technologies ].map(rule => rule.tag);
}
