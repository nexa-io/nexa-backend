from http.server import BaseHTTPRequestHandler
import json
import sqlite3
import os

# Simple in-memory storage (works on Vercel)
orders = []
current_order_id = 1

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            # Simulate bot response
            response = {
                "status": "success",
                "message": "🤖 Nexa Bot is running on Vercel!",
                "orders_count": len(orders)
            }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            error_response = {"error": str(e)}
            self.wfile.write(json.dumps(error_response).encode())
    
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        response = "🤖 Nexa Bot is running!\n\n"
        response += f"📊 Orders in memory: {len(orders)}\n"
        response += "✅ Serverless function working!"
        self.wfile.write(response.encode())
