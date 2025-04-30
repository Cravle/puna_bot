#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

DB_FILE="data/betting.db"
BACKUP_BRANCH="backup"
MAIN_BRANCH="master" # <-- FIXED: Changed to master
COMMIT_MESSAGE="Automated DB backup $(date +'%Y-%m-%d %H:%M:%S')"

# --- SSH Configuration (Crucial for Render Deploy Key) ---
# Check if the required environment variable is set
if [ -z "$GIT_SSH_URL" ]; then
  echo "Error: GIT_SSH_URL environment variable is not set. Please set it in Render." >&2
  exit 1
fi

# Ensure the .ssh directory exists (still needed for ssh-agent)
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# --- Add Private Key from SSH_PRIVATE_KEY Environment Variable ---
if [ -z "$SSH_PRIVATE_KEY" ]; then
  echo "Error: SSH_PRIVATE_KEY environment variable is not set. Git push will likely fail." >&2
else
  echo "Attempting to add SSH key from SSH_PRIVATE_KEY environment variable..."
  eval "$(ssh-agent -s)" > /dev/null
  echo "$SSH_PRIVATE_KEY" | tr -d '\r' | ssh-add - > /dev/null
  echo "SSH key added to agent."
fi
# --- End Key Handling ---

# --- Git Configuration ---
# Optional: Configure git user (Render might do this automatically)
# git config --global user.name "Render CI"
# git config --global user.email "ci@render-ci.com"

# Define the SSH command to disable strict host key checking
GIT_SSH_COMMAND_OPTS="ssh -o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no"

echo "Starting database backup process..."

# --- Git Setup: Ensure Remote Origin is Correctly Configured ---
if git remote | grep -q '^origin$'; then
  echo "Remote 'origin' found. Ensuring it uses the correct SSH URL..."
  git remote set-url origin "$GIT_SSH_URL"
else
  echo "Remote 'origin' not found. Adding it..."
  git remote add origin "$GIT_SSH_URL"
fi

# --- Fetch backup branch ---
echo "Fetching backup branch..."
# Use GIT_SSH_COMMAND for fetch
GIT_SSH_COMMAND="$GIT_SSH_COMMAND_OPTS" git fetch origin $BACKUP_BRANCH || echo "No backup branch yet."

# --- Check if backup branch exists locally ---
if git show-ref --quiet refs/heads/$BACKUP_BRANCH; then
  echo "Switching to local branch '$BACKUP_BRANCH'..."
  git checkout $BACKUP_BRANCH
else
  echo "Creating local branch '$BACKUP_BRANCH' from origin/$MAIN_BRANCH..." # <-- Uses correct MAIN_BRANCH variable
  # Try creating from remote master first, fallback to creating an empty branch if remote doesn't exist yet
  GIT_SSH_COMMAND="$GIT_SSH_COMMAND_OPTS" git checkout -b $BACKUP_BRANCH origin/$MAIN_BRANCH || git checkout -b $BACKUP_BRANCH
fi

# --- Pull latest changes ---
echo "Pulling latest changes for '$BACKUP_BRANCH'..."
# Use GIT_SSH_COMMAND for pull and specify merge strategy
GIT_SSH_COMMAND="$GIT_SSH_COMMAND_OPTS" git pull --ff-only origin $BACKUP_BRANCH || {
  echo "Cannot fast-forward. Trying merge strategy..."
  # Use correct options from git pull help
  GIT_SSH_COMMAND="$GIT_SSH_COMMAND_OPTS" git -c pull.rebase=false pull --strategy=recursive --strategy-option=theirs origin $BACKUP_BRANCH || echo "First backup, no remote changes yet."
}

# --- Add and Commit the Database ---
echo "Adding database file '$DB_FILE'..."
git add $DB_FILE

if git diff --staged --quiet; then
  echo "No changes detected in '$DB_FILE'. Backup not needed."
else
  echo "Committing changes..."
  git commit -m "$COMMIT_MESSAGE"

  echo "Pushing changes to origin/$BACKUP_BRANCH..."
  # Use GIT_SSH_COMMAND for push
  GIT_SSH_COMMAND="$GIT_SSH_COMMAND_OPTS" git push origin $BACKUP_BRANCH
  echo "Database backup pushed successfully."
fi

# --- Switch back to main branch --- 
echo "Switching back to branch '$MAIN_BRANCH'..." # <-- Uses correct MAIN_BRANCH variable
git checkout $MAIN_BRANCH

echo "Database backup process finished."