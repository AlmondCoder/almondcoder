#!/usr/bin/env python3
"""
Create a test merge conflict scenario in /Users/user/projects/website
for testing AlmondCoder's merge conflict modal.

This script creates a proper git worktree structure as expected by AlmondCoder:
- Creates initial commit on main with test file
- Creates worktree with almondcoder/* branch
- Modifies file in worktree (creates commit in worktree branch)
- Modifies same file in main (creates conflicting commit)
"""

import os
import subprocess
import uuid
from pathlib import Path
import shutil

# Target repository
REPO_PATH = Path("/Users/user/projects/website")
TEST_FILE = "abc.txt"


def run_git_command(cmd, cwd=None):
    """Run a git command and return output."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd or REPO_PATH,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"❌ Git command failed: {' '.join(cmd)}")
        print(f"   Error: {e.stderr}")
        raise


def main():
    print("🔧 AlmondCoder Merge Conflict Test Setup (Worktree Version)")
    print("=" * 50)

    # 1. Check if repo exists
    if not REPO_PATH.exists():
        print(f"❌ Repository not found: {REPO_PATH}")
        print("   Please create the repository first.")
        return

    if not (REPO_PATH / ".git").exists():
        print(f"❌ Not a git repository: {REPO_PATH}")
        print(f"   Please initialize git first: cd {REPO_PATH} && git init")
        return

    print(f"✅ Found git repository: {REPO_PATH}")

    # 2. Get current branch (should be main/master)
    current_branch = run_git_command(["git", "branch", "--show-current"])
    print(f"📍 Current branch: {current_branch}")

    # Ensure we're on main or master
    if current_branch not in ["main", "master"]:
        print(f"⚠️  Not on main/master. Switching to main...")
        try:
            run_git_command(["git", "checkout", "main"])
            current_branch = "main"
        except:
            try:
                run_git_command(["git", "checkout", "master"])
                current_branch = "master"
            except:
                print("❌ Could not switch to main/master branch")
                return

    main_branch = current_branch
    print(f"✅ Working on branch: {main_branch}")

    # 3. Create initial test file on main branch
    test_file_path = REPO_PATH / TEST_FILE
    print(f"\n📝 Creating test file: {TEST_FILE}")

    initial_content = """Line 1: Initial content
Line 2: This will cause a conflict
Line 3: Because both branches will modify this
Line 4: Final line
"""

    test_file_path.write_text(initial_content)
    run_git_command(["git", "add", TEST_FILE])
    run_git_command(["git", "commit", "-m", "Add initial abc.txt file"])
    print(f"✅ Committed {TEST_FILE} to {main_branch}")

    # 4. Create almondcoder branch and worktree
    short_uuid = str(uuid.uuid4())[:8]
    almond_branch = f"almondcoder/test-conflict-{short_uuid}"
    worktree_name = f"test-conflict-{short_uuid}"

    # AlmondCoder stores worktrees in ~/.almondcoder/<project-name>/<worktree-name>
    almondcoder_dir = Path.home() / ".almondcoder"
    project_name = REPO_PATH.name
    project_worktree_dir = almondcoder_dir / project_name
    worktree_path = project_worktree_dir / worktree_name

    # Ensure directories exist
    project_worktree_dir.mkdir(parents=True, exist_ok=True)

    print(f"\n🌿 Creating worktree with branch: {almond_branch}")
    print(f"📂 Worktree path: {worktree_path}")

    # Remove worktree path if it already exists
    if worktree_path.exists():
        print(f"⚠️  Removing existing worktree directory: {worktree_path}")
        shutil.rmtree(worktree_path)

    # Create worktree
    run_git_command(["git", "worktree", "add", "-b", almond_branch, str(worktree_path), main_branch])
    print(f"✅ Created worktree at {worktree_path}")

    # 5. Modify the file in the worktree
    worktree_test_file = worktree_path / TEST_FILE
    almond_content = """Line 1: Initial content
Line 2: ALMONDCODER VERSION - This is the AI's change
Line 3: ALMONDCODER VERSION - Modified by the assistant
Line 4: Final line
"""

    print(f"\n✏️  Modifying {TEST_FILE} in worktree...")
    worktree_test_file.write_text(almond_content)
    run_git_command(["git", "add", TEST_FILE], cwd=worktree_path)
    run_git_command(["git", "commit", "-m", "Modify abc.txt in almondcoder branch"], cwd=worktree_path)
    print(f"✅ Modified and committed {TEST_FILE} in {almond_branch}")

    # 6. Make conflicting changes in main branch
    print(f"\n🔄 Creating conflicting change in {main_branch}")

    main_content = """Line 1: Initial content
Line 2: MAIN VERSION - This is the manual change
Line 3: MAIN VERSION - Modified directly on main
Line 4: Final line
"""

    test_file_path.write_text(main_content)
    run_git_command(["git", "add", TEST_FILE])
    run_git_command(["git", "commit", "-m", "Modify abc.txt on main branch (conflicting)"])
    print(f"✅ Created conflicting change in {main_branch}")

    # 7. Summary
    print("\n" + "=" * 50)
    print("✅ Merge conflict scenario created successfully!")
    print("\n📋 What was created:")
    print(f"   • File: {TEST_FILE}")
    print(f"   • Main branch: {main_branch} (with MAIN VERSION changes)")
    print(f"   • Worktree branch: {almond_branch} (with ALMONDCODER VERSION changes)")
    print(f"   • Worktree location: {worktree_path}")
    print(f"\n🧪 To test in AlmondCoder:")
    print(f"   1. Open the project: {REPO_PATH}")
    print(f"   2. Go to the Overview tab")
    print(f"   3. Drag the '{almond_branch}' node onto '{main_branch}'")
    print(f"   4. Click 'Merge Changes'")
    print(f"   5. The conflict modal should appear!")
    print("\n🧹 To clean up later:")
    print(f"   cd {REPO_PATH}")
    print(f"   git worktree remove {worktree_path}")
    print(f"   git branch -D {almond_branch}")
    print(f"   git reset --hard HEAD~2  # Remove test commits")
    print(f"   rm {TEST_FILE}")
    print()


if __name__ == "__main__":
    main()
