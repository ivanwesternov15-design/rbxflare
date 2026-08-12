FROM python:3.11-slim

WORKDIR /app

COPY . .

WORKDIR /app/server

RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 8080

CMD ["python", "main.py"]