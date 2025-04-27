#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

DB_FILE="data/betting.db"
BACKUP_BRANCH="backup"
MAIN_BRANCH="main" # Or your primary branch name (e.g., master)
COMMIT_MESSAGE="Automated DB backup $(date +'%Y-%m-%d %H:%M:%S')"

# --- SSH Configuration (Crucial for Render Deploy Key) ---
# Check if the required environment variable is set
if [ -z "$GIT_SSH_URL" ]; then
  echo "Error: GIT_SSH_URL environment variable is not set. Please set it in Render." >&2
  exit 1
fi

# Ensure the .ssh directory exists
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Disable strict host key checking to avoid prompts
# This is generally safe in controlled CI/CD environments
echo "Host github.com\n  StrictHostKeyChecking no\n  UserKnownHostsFile=/dev/null" >> ~/.ssh/config
# If using GitLab/Bitbucket, add similar blocks for their hostnames (e.g., Host gitlab.com)

# --- Add Private Key from SSH_PRIVATE_KEY Environment Variable ---
if [ -z "$SSH_PRIVATE_KEY" ]; then
  echo "Error: SSH_PRIVATE_KEY environment variable is not set. Git push will likely fail." >&2
  # Decide if this should be a fatal error or just a warning
  # exit 1 
else
  echo "Attempting to add SSH key from SSH_PRIVATE_KEY environment variable..."
  # Start the ssh-agent
  eval "$(ssh-agent -s)" > /dev/null
  # Add the key. Use tr -d '\r' to remove potential carriage returns if key was copied from Windows
  echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add - > /dev/null
  echo "SSH key added to agent."
fi
# --- End Key Handling ---

# --- Git Configuration ---
# Set remote URL to use SSH, fetched from environment variable
echo "Setting remote origin URL to SSH: $GIT_SSH_URL"
git remote set-url origin "$GIT_SSH_URL"

# Optional: Configure git user (Render might do this automatically)
# git config --global user.name "Render CI"
# git config --global user.email "ci@render-ci.com" 


echo "Starting database backup process..."

# --- Git Setup (Render environment doesn't have .git folder) ---
if [ ! -d ".git" ]; then
  echo "Initializing new git repository..."
  git init

  echo "Setting remote origin..."
  git remote add origin "$GIT_SSH_URL"

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