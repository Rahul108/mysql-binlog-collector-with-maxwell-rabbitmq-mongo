.PHONY: up down restart logs upsert-test monitor clean

# Start all services
up:
	docker compose up -d

# Stop all services
down:
	docker compose down

# Restart all services
restart:
	docker compose down
	docker compose up -d

# View logs of all services
logs:
	docker compose logs -f

# View logs of a specific service
logs-%:
	docker compose logs -f $*

# Run upsert test operations
upsert-test:
	docker compose exec upsert-worker node /app/upsert_worker.js --operations 10 --interval 2

# Access MongoDB shell
mongodb-shell:
	docker compose exec mongodb mongosh

# Access MySQL shell
mysql-shell:
	docker compose exec mysql mysql -uroot -prootpassword sample_db

# Clean up volumes (WARNING: This removes all data)
clean:
	docker compose down -v
	
# Run monitor to view changes
monitor:
	docker compose logs -f monitor

# Build services
build:
	docker compose build

# Help
help:
	@echo "Available commands:"
	@echo "  make up               - Start all services"
	@echo "  make down             - Stop all services"
	@echo "  make restart          - Restart all services"
	@echo "  make logs             - View logs of all services"
	@echo "  make logs-SERVICE     - View logs of a specific service (e.g., make logs-consumer)"
	@echo "  make upsert-test      - Run upsert test operations"
	@echo "  make mongodb-shell    - Access MongoDB shell"
	@echo "  make mysql-shell      - Access MySQL shell"
	@echo "  make clean            - Clean up volumes (WARNING: This removes all data)"
	@echo "  make monitor          - Run monitor to view changes"
	@echo "  make build            - Build services"
	@echo "  make help             - Show this help"
