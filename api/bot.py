from http.server import BaseHTTPRequestHandler
import json
import os
import asyncio
import logging
import sqlite3
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Bot configuration
BOT_TOKEN = "8395957294:AAFV1eTclz9DLjB25D1biofmfhAGkyzSjWg"
ADMIN_CHAT_ID = "5708631492"
ADMIN_USERNAME = "@NkanMike"

# Conversation states
SELECTING_PRODUCT, ENTERING_EMAIL, ENTERING_NAME, SELECTING_CRYPTO, ENTERING_TX_HASH, APPLYING_DISCOUNT = range(6)

# Product list
PRODUCTS = {
    '1': {"name": "Nexa Instant Funding $1000", "price": "$1", "original_price": "$1"},
    '2': {"name": "Nexa $100 1 step", "price": "$2", "original_price": "$2"},
    '3': {"name": "Nexa $100 2 step", "price": "$3", "original_price": "$3"},
    '4': {"name": "Nexa $200 1 step", "price": "$3.5", "original_price": "$3.5"},
    '5': {"name": "Nexa $200 2 step", "price": "$4", "original_price": "$4"},
    '6': {"name": "Nexa $500 1 step", "price": "$7", "original_price": "$7"},
    '7': {"name": "Nexa $500 2 step", "price": "$8", "original_price": "$8"},
    '8': {"name": "Nexa $1000 1 step", "price": "$13", "original_price": "$13"},
    '9': {"name": "Nexa $1000 2 step", "price": "$15", "original_price": "$15"}
}

# Cryptocurrency addresses
CRYPTO_ADDRESSES = {
    'bitcoin': 'bc1quhc73wll0z3h43thnxhj6u6553h2xmd5alfmhq',
    'ethereum': '0x36db1b3e3d891e08323629f8e193ac14dfea123e',
    'solana': 'F7fqUKRtEd9QLTkDUHGYDGmgDoKnXkk8ksZj23CYBpJ1',
    'bnb_smart_chain': '0x36db1b3e3d891e08323629f8e193ac14dfea123e',
    'usdt_ethereum': '0x36db1b3e3d891e08323629f8e193ac14dfea123e',
    'usdc_ethereum': '0x36db1b3e3d891e08323629f8e193ac14dfea123e',
    'usdt_bnb': '0x36db1b3e3d891e08323629f8e193ac14dfea123e',
    'doge': 'DB58B6wkFd7sPu9qzaJqRJ1ozmmXs1EZ8J',
    'tron': 'TTTEDqHW6tigC4q8H3gVn9e8QJWa3KYGdJ',
    'ltc': 'ltc1q9vrfmuzmuajr8dz6q3ktrkatfp6rsrdn7kup9n'
}

# Database setup
def init_database():
    conn = sqlite3.connect('/tmp/nexa_bot.db')  # Use /tmp for Vercel
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            user_name TEXT,
            product_id TEXT,
            product_name TEXT,
            email TEXT,
            full_name TEXT,
            crypto_asset TEXT,
            tx_hash TEXT,
            status TEXT DEFAULT 'pending',
            discount_code TEXT,
            final_price TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            verified_at TIMESTAMP
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS discount_codes (
            code TEXT PRIMARY KEY,
            discount_percent REAL,
            product_id TEXT DEFAULT 'all',
            max_uses INTEGER,
            used_count INTEGER DEFAULT 0,
            expires_at TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    conn.commit()
    conn.close()
    print("✅ Database initialized!")

# Check discount code
def check_discount_code(code, product_id):
    conn = sqlite3.connect('/tmp/nexa_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM discount_codes WHERE code = ? AND (product_id = "all" OR product_id = ?)', (code.upper(), product_id))
    discount = cursor.fetchone()
    conn.close()
    return discount is not None

# Apply discount
def apply_discount(original_price, discount_percent):
    price_num = float(original_price.replace('$', ''))
    discount_amount = price_num * (discount_percent / 100)
    final_price = price_num - discount_amount
    return f"${final_price:.2f}"

# Telegram notification
async def send_order_notification(context, order_data):
    try:
        notification_text = f"""
🚀 NEW NEXA ORDER!

📦 {order_data['product_name']}
👤 {order_data['full_name']}
📧 {order_data['email']}
💰 {order_data['crypto_asset']}
🔗 {order_data['tx_hash']}
🆔 Order #{order_data['order_id']}

/verify {order_data['order_id']}
        """
        await context.bot.send_message(chat_id=ADMIN_CHAT_ID, text=notification_text)
        return True
    except Exception as e:
        print(f"Notification failed: {e}")
        return False

# Start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    keyboard = []
    for product_id, product in PRODUCTS.items():
        keyboard.append([InlineKeyboardButton(f"{product['name']} - {product['price']}", callback_data=f"product_{product_id}")])
    
    await update.message.reply_text(
        "🤖 Welcome to Nexa Bot! Choose a product:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return SELECTING_PRODUCT

# Product selection
async def product_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    product_id = query.data.split('_')[1]
    product = PRODUCTS[product_id]
    context.user_data['product_id'] = product_id
    context.user_data['product_name'] = product['name']
    context.user_data['current_price'] = product['price']
    
    keyboard = [
        [InlineKeyboardButton("✅ Yes, I have discount code", callback_data="has_discount_yes")],
        [InlineKeyboardButton("❌ No, continue without discount", callback_data="has_discount_no")]
    ]
    
    await query.edit_message_text(
        f"🎯 {product['name']}\n\nDo you have a discount code?",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return APPLYING_DISCOUNT

# Discount choice
async def discount_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    if query.data == "has_discount_yes":
        await query.edit_message_text("Enter your discount code:")
        return APPLYING_DISCOUNT
    else:
        await query.edit_message_text("Please enter your email address:")
        return ENTERING_EMAIL

# Process discount
async def process_discount_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    code = update.message.text.strip().upper()
    
    # Simple discount - accept any code for 10% off
    if code:
        original_price = context.user_data['current_price']
        final_price = apply_discount(original_price, 10)
        
        context.user_data['discount_code'] = code
        context.user_data['discount_percent'] = 10
        context.user_data['final_price'] = final_price
        
        await update.message.reply_text(
            f"🎉 Discount {code} applied! (10% off)\n"
            f"💰 Original: {original_price} → Final: {final_price}\n\n"
            "Please enter your email address:"
        )
    else:
        await update.message.reply_text("Please enter your email address:")
    
    return ENTERING_EMAIL

# Email input
async def email_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    email = update.message.text.strip()
    context.user_data['email'] = email
    
    price_info = ""
    if context.user_data.get('discount_code'):
        price_info = f"💰 Final Price: {context.user_data['final_price']} (with 10% discount)\n\n"
    
    await update.message.reply_text(
        f"📧 Email: {email}\n{price_info}Please enter your full name:"
    )
    return ENTERING_NAME

# Name input
async def name_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    full_name = update.message.text.strip()
    context.user_data['full_name'] = full_name
    
    crypto_options = [
        ['Bitcoin', 'bitcoin'],
        ['Ethereum', 'ethereum'], 
        ['Solana', 'solana'],
        ['BNB Smart Chain', 'bnb_smart_chain'],
        ['USDT (Ethereum)', 'usdt_ethereum'],
        ['USDC (Ethereum)', 'usdc_ethereum'],
        ['USDT (BNB)', 'usdt_bnb'],
        ['Dogecoin', 'doge'],
        ['Tron', 'tron'],
        ['Litecoin', 'ltc']
    ]
    
    keyboard = []
    for crypto_name, crypto_key in crypto_options:
        keyboard.append([InlineKeyboardButton(crypto_name, callback_data=f"crypto_{crypto_key}")])
    
    price_info = ""
    if context.user_data.get('discount_code'):
        price_info = f"💰 Final Price: {context.user_data['final_price']}\n\n"
    
    await update.message.reply_text(
        f"👤 Name: {full_name}\n{price_info}Select cryptocurrency:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )
    return SELECTING_CRYPTO

# Crypto selection
async def crypto_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    crypto_key = query.data.split('_')[1]
    crypto_name = crypto_key.replace('_', ' ').title()
    wallet_address = CRYPTO_ADDRESSES[crypto_key]
    
    context.user_data['crypto_asset'] = crypto_name
    context.user_data['wallet_address'] = wallet_address
    
    price_info = context.user_data.get('final_price', context.user_data['current_price'])
    
    await query.edit_message_text(
        f"💰 Payment Method: {crypto_name}\n"
        f"💳 Amount: {price_info}\n\n"
        f"📥 Send payment to:\n`{wallet_address}`\n\n"
        "After sending, enter your Transaction Hash:"
    )
    return ENTERING_TX_HASH

# Transaction hash
async def tx_hash_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tx_hash = update.message.text.strip()
    
    # Save to database
    conn = sqlite3.connect('/tmp/nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        INSERT INTO orders (user_id, user_name, product_id, product_name, email, full_name, crypto_asset, tx_hash, discount_code, final_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        update.message.from_user.id,
        update.message.from_user.first_name,
        context.user_data['product_id'],
        context.user_data['product_name'],
        context.user_data['email'],
        context.user_data['full_name'],
        context.user_data['crypto_asset'],
        tx_hash,
        context.user_data.get('discount_code'),
        context.user_data.get('final_price', context.user_data['current_price'])
    ))
    
    order_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    # Send notification
    order_data = {
        'order_id': order_id,
        'product_name': context.user_data['product_name'],
        'full_name': context.user_data['full_name'],
        'email': context.user_data['email'],
        'crypto_asset': context.user_data['crypto_asset'],
        'tx_hash': tx_hash,
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    await send_order_notification(context, order_data)
    
    # Success message
    discount_info = f"\n🎫 Discount Code: {context.user_data['discount_code']}" if context.user_data.get('discount_code') else ""
    
    success_message = f"""
🎉 Payment Submitted Successfully!

✅ Order Details:
• Product: {context.user_data['product_name']}
• Name: {context.user_data['full_name']}
• Email: {context.user_data['email']}
• Crypto: {context.user_data['crypto_asset']}
• TX Hash: {tx_hash}
• Amount: {context.user_data.get('final_price', context.user_data['current_price'])}
{discount_info}

⏰ We'll verify and prepare your contract within 24 hours.

📞 Contact: https://wa.me/2349160209951

Thank you! 🚀
    """
    
    await update.message.reply_text(success_message)
    context.user_data.clear()
    return ConversationHandler.END

# Admin commands
async def verify_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        return
    
    if not context.args:
        await update.message.reply_text("Usage: /verify <order_id>")
        return
    
    order_id = context.args[0]
    conn = sqlite3.connect('/tmp/nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('SELECT user_id, product_name FROM orders WHERE id = ?', (order_id,))
    order = cursor.fetchone()
    
    if order:
        user_id, product_name = order
        cursor.execute('UPDATE orders SET status = "verified" WHERE id = ?', (order_id,))
        conn.commit()
        
        try:
            await context.bot.send_message(user_id, f"✅ Payment verified! {product_name} is being prepared.")
            await update.message.reply_text(f"Order {order_id} verified!")
        except Exception as e:
            await update.message.reply_text(f"Verified but couldn't notify user: {e}")
    else:
        await update.message.reply_text("Order not found")
    
    conn.close()

async def test_notification(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        return
    
    test_data = {
        'order_id': 999,
        'product_name': 'TEST PRODUCT',
        'full_name': 'Test User',
        'email': 'test@test.com',
        'crypto_asset': 'Bitcoin',
        'tx_hash': 'TEST_HASH_123'
    }
    
    success = await send_order_notification(context, test_data)
    if success:
        await update.message.reply_text("✅ Test notification sent!")
    else:
        await update.message.reply_text("❌ Test failed!")

async def list_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        return
    
    conn = sqlite3.connect('/tmp/nexa_bot.db')
    cursor = conn.cursor()
    cursor.execute('SELECT id, product_name, full_name, status FROM orders ORDER BY id DESC LIMIT 10')
    orders = cursor.fetchall()
    conn.close()
    
    if orders:
        text = "📋 Last 10 Orders:\n\n"
        for order in orders:
            status_icon = "✅" if order[3] == 'verified' else "⏳"
            text += f"{status_icon} Order {order[0]}: {order[1]}\n👤 {order[2]}\n\n"
        await update.message.reply_text(text)
    else:
        await update.message.reply_text("No orders found")

async def add_discount_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        return
    
    if len(context.args) < 3:
        await update.message.reply_text("Usage: /addcode CODE PERCENT DAYS")
        return
    
    code, percent, days = context.args[0].upper(), float(context.args[1]), int(context.args[2])
    expires_at = datetime.now() + timedelta(days=days)
    
    conn = sqlite3.connect('/tmp/nexa_bot.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute('INSERT INTO discount_codes (code, discount_percent, max_uses, expires_at) VALUES (?, ?, ?, ?)',
                      (code, percent, 1000, expires_at))
        conn.commit()
        await update.message.reply_text(f"✅ Discount code {code} added!")
    except:
        await update.message.reply_text("❌ Code already exists")
    
    conn.close()

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("❌ Order cancelled. Use /start to begin again.")
    context.user_data.clear()
    return ConversationHandler.END

async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.error(f"Error: {context.error}")
    try:
        await update.message.reply_text("😅 Something went wrong. Please try /start")
    except:
        pass

# ========== VERCEL WEBHOOK SETUP ==========
# Initialize application
application = Application.builder().token(BOT_TOKEN).build()

# Add handlers
conv_handler = ConversationHandler(
    entry_points=[CommandHandler('start', start)],
    states={
        SELECTING_PRODUCT: [CallbackQueryHandler(product_selected, pattern='^product_')],
        APPLYING_DISCOUNT: [
            CallbackQueryHandler(discount_choice, pattern='^has_discount_'),
            MessageHandler(filters.TEXT & ~filters.COMMAND, process_discount_code)
        ],
        ENTERING_EMAIL: [MessageHandler(filters.TEXT & ~filters.COMMAND, email_input)],
        ENTERING_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, name_input)],
        SELECTING_CRYPTO: [CallbackQueryHandler(crypto_selected, pattern='^crypto_')],
        ENTERING_TX_HASH: [MessageHandler(filters.TEXT & ~filters.COMMAND, tx_hash_input)],
    },
    fallbacks=[CommandHandler('cancel', cancel)],
)

application.add_handler(conv_handler)
application.add_handler(CommandHandler('verify', verify_payment))
application.add_handler(CommandHandler('test', test_notification))
application.add_handler(CommandHandler('orders', list_orders))
application.add_handler(CommandHandler('addcode', add_discount_code))
application.add_error_handler(error_handler)

# Initialize database
init_database()

# Vercel handler
class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        update_data = json.loads(post_data.decode('utf-8'))
        
        async def process_update():
            update = Update.de_json(update_data, application.bot)
            await application.process_update(update)
        
        asyncio.run(process_update())
        
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps({"status": "ok"}).encode())
    
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b'🤖 Nexa Bot is running on Vercel!')
