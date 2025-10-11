from http.server import BaseHTTPRequestHandler
import json
import sqlite3
import os
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOT_TOKEN = "8395957294:AAFV1eTclz9DLjB25D1biofmfhAGkyzSjWg"
ADMIN_CHAT_ID = "5708631492"

# Simple storage
orders = []
products = [
    "Nexa $1000 - $1",
    "Nexa $100 1 step - $2", 
    "Nexa $100 2 step - $3"
]

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            update = json.loads(post_data.decode('utf-8'))
            
            response = await self.process_update(update)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())
            
        except Exception as e:
            logger.error(f"Error: {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    async def process_update(self, update):
        if 'message' in update:
            return await self.handle_message(update['message'])
        elif 'callback_query' in update:
            return await self.handle_callback(update['callback_query'])
        return {"status": "processed"}
    
    async def handle_message(self, message):
        chat_id = message['chat']['id']
        text = message.get('text', '')
        
        if text == '/start':
            await self.send_telegram_message(chat_id, "🤖 Welcome to Nexa Bot!\n\nUse /products to see available products.")
        
        elif text == '/products':
            products_text = "📦 Available Products:\n\n" + "\n".join([f"• {p}" for p in products])
            await self.send_telegram_message(chat_id, products_text)
        
        elif text == '/test':
            # Test order notification
            test_order = {
                'product': 'TEST PRODUCT',
                'name': 'Test User', 
                'email': 'test@test.com',
                'crypto': 'Bitcoin',
                'tx_hash': 'TEST123'
            }
            orders.append(test_order)
            await self.send_admin_notification(test_order)
            await self.send_telegram_message(chat_id, "✅ Test order submitted! Check your DMs.")
        
        else:
            await self.send_telegram_message(chat_id, "✅ Message received! Use /start to begin an order.")
        
        return {"status": "message_processed"}
    
    async def handle_callback(self, callback_query):
        # Handle button clicks
        chat_id = callback_query['message']['chat']['id']
        data = callback_query['data']
        
        await self.send_telegram_message(chat_id, f"✅ Selected: {data}")
        return {"status": "callback_processed"}
    
    async def send_telegram_message(self, chat_id, text):
        import requests
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        payload = {
            "chat_id": chat_id,
            "text": text
        }
        requests.post(url, json=payload)
    
    async def send_admin_notification(self, order):
        notification = f"""
🚀 NEW ORDER!
📦 {order['product']}
👤 {order['name']}
📧 {order['email']}
💰 {order['crypto']}
🔗 {order['tx_hash']}
        """
        await self.send_telegram_message(ADMIN_CHAT_ID, notification)
    
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        response = f"🤖 Nexa Bot is running!\n📊 Orders: {len(orders)}"
        self.wfile.write(response.encode())
