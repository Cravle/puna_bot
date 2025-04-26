#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

DB_FILE="data/betting.db"
BACKUP_BRANCH="backup"
MAIN_BRANCH="main" # Your main branch
COMMIT_MESSAGE="Automated DB backup $(date +'%Y-%m-%d %H:%M:%S')"
REPO_URL="https://github.com/Cravle/puna_bot.git"

echo "Starting database backup process..."

# --- Git Setup (Render environment doesn't have .git folder) ---
if [ ! -d ".git" ]; then
  echo "Initializing new git repository..."
  git init

  echo "Setting remote origin..."
  git remote add origin "$REPO_URL"

  echo "Setting git user config..."
  git config user.name "Render CI"
  git config user.email "ci@render.com"
fi

# --- Fetch backup branch ---
echo "Fetching backup branch..."
git fetch origin $BACKUP_BRANCH || echo "No backup branch yet."

# --- Check if backup branch exists locally ---
if git show-ref --quiet refs/heads/$BACKUP_BRANCH; then
  echo "Switching to local branch '$BACKUP_BRANCH'..."
  git checkout $BACKUP_BRANCH
else
  echo "Creating local branch '$BACKUP_BRANCH' from origin/$MAIN_BRANCH..."
  git checkout -b $BACKUP_BRANCH origin/$MAIN_BRANCH || git checkout -b $BACKUP_BRANCH
fi

# --- Pull latest changes ---
echo "Pulling latest changes for '$BACKUP_BRANCH'..."
git pull origin $BACKUP_BRANCH || echo "First backup, no remote changes yet."

# --- Add and Commit the Database ---
echo "Adding database file '$DB_FILE'..."
git add $DB_FILE

if git diff --staged --quiet; then
  echo "No changes detected in '$DB_FILE'. Backup not needed."
else
  echo "Committing changes..."
  git commit -m "$COMMIT_MESSAGE"

  echo "Pushing changes to origin/$BACKUP_BRANCH..."
  git push origin $BACKUP_BRANCH
  echo "Database backup pushed successfully."
fi

# --- Switch back to main branch ---
echo "Switching back to branch '$MAIN_BRANCH'..."
git checkout $MAIN_BRANCH

echo "Database backup process finished."