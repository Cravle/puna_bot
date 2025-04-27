#!/bin/bash

set -e  # Остановить скрипт если какая-то команда упала

# --- Переменные ---
DB_FILE="data/betting.db"
BACKUP_BRANCH="backup"
MAIN_BRANCH="master"
COMMIT_MESSAGE="Automated DB backup $(date +'%Y-%m-%d %H:%M:%S')"
REPO_URL="git@github.com:Cravle/puna_bot.git"

echo "=== 🛡️  Starting database backup ==="

# --- SSH Setup ---
if [ -n "$SSH_PRIVATE_KEY" ]; then
  echo "Setting up SSH key..."
  eval "$(ssh-agent -s)"
  echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add -
  
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  touch ~/.ssh/known_hosts
  ssh-keyscan github.com >> ~/.ssh/known_hosts
fi

# --- Git Setup ---
if [ ! -d ".git" ]; then
  echo "Initializing git repository..."
  git init
  git remote add origin "$REPO_URL"
  git config user.name "Render CI"
  git config user.email "ci@render.com"
fi

echo "Checking git remote:"
git remote -v

# --- Fetch & Checkout ---
echo "Fetching from origin..."
git fetch origin || echo "Nothing to fetch yet."

# Пытаемся переключиться на backup ветку
if git rev-parse --verify $BACKUP_BRANCH >/dev/null 2>&1; then
  echo "Switching to local branch '$BACKUP_BRANCH'..."
  git checkout $BACKUP_BRANCH
else
  echo "Creating local branch '$BACKUP_BRANCH' from '$MAIN_BRANCH'..."
  git fetch origin $MAIN_BRANCH || echo "No remote main branch, using local state."
  git checkout -b $BACKUP_BRANCH || git checkout -b $BACKUP_BRANCH origin/$MAIN_BRANCH
fi

# --- Pull последнюю версию ---
echo "Pulling latest changes for '$BACKUP_BRANCH'..."
git pull origin $BACKUP_BRANCH || echo "First time backup, no remote changes."

# --- Добавляем базу данных ---
echo "Adding database file '$DB_FILE'..."
git add $DB_FILE

# --- Проверяем изменения ---
if git diff --staged --quiet; then
  echo "No changes detected in '$DB_FILE'. Skipping backup."
else
  echo "Committing backup..."
  git commit -m "$COMMIT_MESSAGE"
  echo "Pushing backup to '$BACKUP_BRANCH'..."
  git push origin $BACKUP_BRANCH
  echo "✅ Backup pushed successfully."
fi

# --- Возврат на main ветку ---
echo "Switching back to '$MAIN_BRANCH'..."
git checkout $MAIN_BRANCH || echo "No main branch locally."

echo "=== ✅ Database backup finished ==="