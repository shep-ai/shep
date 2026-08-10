#!/usr/bin/env bash
#
# init-feature.sh - Scaffold a new feature specification directory
#
# Usage: init-feature.sh <NNN> <feature-name>
# Example: init-feature.sh 001 user-authentication
#
# Creates specs/NNN-feature-name/ with all template files

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate arguments
if [ $# -ne 2 ]; then
    echo -e "${RED}Error: Expected 2 arguments${NC}"
    echo "Usage: $0 <NNN> <feature-name>"
    echo "Example: $0 001 user-authentication"
    exit 1
fi

NNN="$1"
FEATURE_NAME="$2"
DATE=$(date +%Y-%m-%d)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FEATURE_NUMBER=$((10#$NNN))  # Remove leading zeros

# Validate NNN format (3 digits)
if ! [[ "$NNN" =~ ^[0-9]{3}$ ]]; then
    echo -e "${RED}Error: NNN must be 3 digits (e.g., 001, 042)${NC}"
    exit 1
fi

# Validate feature name (kebab-case)
if ! [[ "$FEATURE_NAME" =~ ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ ]]; then
    echo -e "${RED}Error: feature-name must be kebab-case (e.g., user-auth, payment-integration)${NC}"
    exit 1
fi

SPEC_DIR="specs/${NNN}-${FEATURE_NAME}"
SKILL_DIR=".claude/skills/shep-kit-new-feature"

# Check if spec directory already exists
if [ -d "$SPEC_DIR" ]; then
    echo -e "${RED}Error: ${SPEC_DIR} already exists${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating spec directory: ${SPEC_DIR}${NC}"

# Create directory structure
mkdir -p "${SPEC_DIR}/contracts"

# Copy and process templates
process_template() {
    local template="$1"
    local output="$2"

    if [ -f "$template" ]; then
        # Match both {{VAR}} (in content blocks) and { { VAR } } (Prettier-formatted YAML fields)
        sed -e "s/{ { NNN } }/${NNN}/g" -e "s/{{NNN}}/${NNN}/g" \
            -e "s/{ { FEATURE_NAME } }/${FEATURE_NAME}/g" -e "s/{{FEATURE_NAME}}/${FEATURE_NAME}/g" \
            -e "s/{ { DATE } }/${DATE}/g" -e "s/{{DATE}}/${DATE}/g" \
            -e "s/{ { FEATURE_ID } }/${NNN}-${FEATURE_NAME}/g" -e "s/{{FEATURE_ID}}/${NNN}-${FEATURE_NAME}/g" \
            -e "s/{ { FEATURE_NUMBER } }/${FEATURE_NUMBER}/g" -e "s/{{FEATURE_NUMBER}}/${FEATURE_NUMBER}/g" \
            -e "s/{ { BRANCH_NAME } }/feat\/${NNN}-${FEATURE_NAME}/g" -e "s/{{BRANCH_NAME}}/feat\/${NNN}-${FEATURE_NAME}/g" \
            -e "s/{ { TIMESTAMP } }/${TIMESTAMP}/g" -e "s/{{TIMESTAMP}}/${TIMESTAMP}/g" \
            "$template" > "$output"
        echo -e "  ${GREEN}Created${NC}: $output"
    else
        echo -e "  ${YELLOW}Warning${NC}: Template not found: $template"
    fi
}

# Process all templates
process_template "${SKILL_DIR}/templates/spec.yaml" "${SPEC_DIR}/spec.yaml"
process_template "${SKILL_DIR}/templates/research.yaml" "${SPEC_DIR}/research.yaml"
process_template "${SKILL_DIR}/templates/plan.yaml" "${SPEC_DIR}/plan.yaml"
process_template "${SKILL_DIR}/templates/tasks.yaml" "${SPEC_DIR}/tasks.yaml"
process_template "${SKILL_DIR}/templates/data-model.md" "${SPEC_DIR}/data-model.md"
process_template "${SKILL_DIR}/templates/feature.yaml" "${SPEC_DIR}/feature.yaml"

# Create contracts .gitkeep
touch "${SPEC_DIR}/contracts/.gitkeep"
echo -e "  ${GREEN}Created${NC}: ${SPEC_DIR}/contracts/.gitkeep"

echo -e "${GREEN}Done!${NC} Spec directory scaffolded at ${SPEC_DIR}"
echo ""
echo "Files created:"
echo "  - spec.yaml (feature specification)"
echo "  - research.yaml (technical decisions)"
echo "  - plan.yaml (implementation strategy)"
echo "  - tasks.yaml (task breakdown)"
echo "  - data-model.md (domain models)"
echo "  - feature.yaml (status tracking)"
echo "  - contracts/.gitkeep (API contracts)"
echo ""
echo "Next steps:"
echo "  1. Fill in spec.yaml with feature requirements"
echo "  2. Run /shep-kit:research for technical analysis"
echo "  3. Run /shep-kit:plan for implementation breakdown"
echo "  4. Run /shep-kit:implement to start autonomous implementation"
