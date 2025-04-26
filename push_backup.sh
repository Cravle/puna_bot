#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

DB_FILE="data/betting.db"
BACKUP_BRANCH="backup"
MAIN_BRANCH="main" # Or your primary branch name (e.g., master)
COMMIT_MESSAGE="Automated DB backup $(date +'%Y-%m-%d %H:%M:%S')"

echo "Starting database backup process..."

# --- Git Configuration (Important for Render Environment) ---
# Render might require you to configure git user details
# You might need to set these via environment variables in Render
# git config --global user.name "Render CI"
# git config --global user.email "ci@render.com"
# Ensure you have SSH keys or HTTPS credentials set up for push access

# --- Check if backup branch exists ---
if git rev-parse --verify $BACKUP_BRANCH > /dev/null 2>&1; then
  echo "Switching to branch '$BACKUP_BRANCH'..."
  git checkout $BACKUP_BRANCH
else
  echo "Creating and switching to branch '$BACKUP_BRANCH'..."
  git checkout -b $BACKUP_BRANCH
fi

# --- Ensure the latest changes from remote are pulled ---
# This avoids conflicts if the branch was updated elsewhere
echo "Pulling latest changes for '$BACKUP_BRANCH'..."
git pull origin $BACKUP_BRANCH

# --- Add and Commit the Database ---
echo "Adding database file '$DB_FILE'..."
git add $DB_FILE

# Check if there are changes to commit
if git diff --staged --quiet; then
  echo "No changes detected in '$DB_FILE'. Backup not needed."
else
  echo "Committing changes..."
  git commit -m "$COMMIT_MESSAGE"

  # --- Push to Remote ---
  echo "Pushing changes to origin/$BACKUP_BRANCH..."
  git push origin $BACKUP_BRANCH
  echo "Database backup pushed successfully."
fi

# --- Switch back to the main branch ---
echo "Switching back to branch '$MAIN_BRANCH'..."
git checkout $MAIN_BRANCH

echo "Database backup process finished." 