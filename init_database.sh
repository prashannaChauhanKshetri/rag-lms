#!/bin/bash
# Database initialization script for RAG-LMS PostgreSQL migration

echo "RAG-LMS PostgreSQL Database Setup"
echo "=================================="
echo ""

# Database configuration
DB_NAME="rag_lms"
DB_USER="rag_lms_user"
DB_PASSWORD="raglms_secure_2025"
DB_HOST="localhost"
DB_PORT="5432"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Step 1: Installing pgvector extension${NC}"
echo "Checking if pgvector is installed..."

# Check if pgvector is installed
if brew list pgvector &>/dev/null; then
    echo -e "${GREEN}✓ pgvector already installed${NC}"
else
    echo "Installing pgvector via Homebrew..."
    brew install pgvector
fi

echo ""
echo -e "${YELLOW}Step 2: Creating PostgreSQL database and user${NC}"

# Create user and database (you'll be prompted for postgres password)
psql -h $DB_HOST -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User may already exist"
psql -h $DB_HOST -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || echo "Database may already exist"
psql -h $DB_HOST -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null

echo ""
echo -e "${YELLOW}Step 3: Running schema setup${NC}"

# Run the setup SQL file
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -f setup_postgres.sql

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✓ Database setup completed successfully!${NC}"
    echo ""
    echo "Database Details:"
    echo "----------------"
    echo "Database: $DB_NAME"
    echo "User: $DB_USER"
    echo "Host: $DB_HOST"
    echo "Port: $DB_PORT"
    echo ""
    echo "Connection String:"
    echo "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update your .env file with the connection string above"
    echo "2. Install Python dependencies: pip install psycopg2-binary pgvector"
    echo "3. Run the data migration script to transfer existing data"
else
    echo -e "${RED}✗ Database setup failed. Please check the errors above.${NC}"
    exit 1
fi
