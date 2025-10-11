import logging
import sqlite3
import asyncio
from datetime import datetime, timedelta
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes, ConversationHandler

# In crypto_selected function, add this at the start:
async def crypto_selected(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    crypto_key = query.data.split('_')[1]
    print(f"🔍 Selected crypto key: '{crypto_key}'")
    print(f"🔍 Available keys: {list(CRYPTO_ADDRESSES.keys())}")
    
    # Rest of your code...
# Configure logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
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
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    # Drop and recreate tables with new schema
    cursor.execute('DROP TABLE IF EXISTS orders')
    cursor.execute('DROP TABLE IF EXISTS discount_codes')
    
    # Recreate orders table with discount columns
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
    print("✅ Database initialized with discount support!")

# Apply discount to price
def apply_discount(original_price, discount_percent):
    # Remove $ sign and convert to float
    price_num = float(original_price.replace('$', ''))
    discount_amount = price_num * (discount_percent / 100)
    final_price = price_num - discount_amount
    return f"${final_price:.2f}"

# Mark discount code as used
def mark_discount_used(code):
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    cursor.execute('UPDATE discount_codes SET used_count = used_count + 1 WHERE code = ?', (code,))
    conn.commit()
    conn.close()

# Telegram notification function
async def send_order_notification(context: ContextTypes.DEFAULT_TYPE, order_data):
    notification_text = f"""
🚀 *NEW NEXA ORDER RECEIVED!*

📦 *Product:* {order_data['product_name']}
👤 *Customer Name:* {order_data['full_name']}
📧 *Email:* {order_data['email']}
💰 *Crypto Asset:* {order_data['crypto_asset']}
🔗 *Transaction Hash:* `{order_data['tx_hash']}`
⏰ *Order Time:* {order_data['timestamp']}
🆔 *Order ID:* {order_data['order_id']}"""

    if order_data.get('discount_code'):
        notification_text += f"\n🎫 *Discount Code:* {order_data['discount_code']}"
        notification_text += f"\n💰 *Final Price:* {order_data['final_price']}"

    notification_text += f"\n\n*Use this command to verify:*\n/verify {order_data['order_id']}"
    
    # Try Chat ID first
    try:
        await context.bot.send_message(
            chat_id=ADMIN_CHAT_ID,
            text=notification_text,
            parse_mode='Markdown'
        )
        print(f"✅ Notification sent to Chat ID: {ADMIN_CHAT_ID}")
        return True
    except Exception as e:
        print(f"❌ Failed to send to Chat ID {ADMIN_CHAT_ID}: {e}")
    
    # Try username as fallback
    try:
        await context.bot.send_message(
            chat_id=ADMIN_USERNAME,
            text=notification_text,
            parse_mode='Markdown'
        )
        print(f"✅ Notification sent to Username: {ADMIN_USERNAME}")
        return True
    except Exception as e:
        print(f"❌ Failed to send to Username {ADMIN_USERNAME}: {e}")
    
    print(f"🔴 ORDER REQUIRES ATTENTION - ID: {order_data['order_id']}")
    return False

# Start command
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    welcome_message = """
🤖 *Welcome to Nexa Bot!*

I'll help you purchase Nexa funding products quickly and securely.

Let's get started! Please select the product you'd like to purchase:
    """
    
    keyboard = []
    for product_id, product in PRODUCTS.items():
        keyboard.append([InlineKeyboardButton(
            f"{product['name']} - {product['price']}", 
            callback_data=f"product_{product_id}"
        )])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await update.message.reply_text(
        welcome_message,
        reply_markup=reply_markup,
        parse_mode='Markdown'
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
    context.user_data['original_price'] = product['price']
    context.user_data['current_price'] = product['price']
    
    # Ask if user has a discount code
    keyboard = [
        [InlineKeyboardButton("✅ Yes, I have a discount code", callback_data="has_discount_yes")],
        [InlineKeyboardButton("❌ No, continue without discount", callback_data="has_discount_no")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    await query.edit_message_text(
        f"🎯 *Product Selected: [{product['name']}]*\n\n"
        f"💰 *Price:* {product['price']}\n\n"
        "Do you have a discount code?",
        reply_markup=reply_markup,
        parse_mode='Markdown'
    )
    
    return APPLYING_DISCOUNT

# Discount code handling
async def discount_choice(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    choice = query.data.split('_')[2]  # yes or no
    
    if choice == 'yes':
        await query.edit_message_text(
            f"🎫 *[{context.user_data['product_name']}]*\n\n"
            "Please enter your discount code:",
            parse_mode='Markdown'
        )
        return APPLYING_DISCOUNT
    else:
        await query.edit_message_text(
            f"🎯 *[{context.user_data['product_name']}]*\n\n"
            "Great! Now please enter your email address as registered on Nexa:",
            parse_mode='Markdown'
        )
        return ENTERING_EMAIL

# Process discount code
async def process_discount_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    discount_code = update.message.text.strip().upper()
    product_id = context.user_data['product_id']
    
    # Check if discount code is valid
    discount = check_discount_code(discount_code, product_id)
    
    if discount:
        # Apply discount
        original_price = context.user_data['original_price']
        final_price = apply_discount(original_price, discount['discount_percent'])
        
        context.user_data['discount_code'] = discount_code
        context.user_data['discount_percent'] = discount['discount_percent']
        context.user_data['final_price'] = final_price
        context.user_data['current_price'] = final_price
        
        await update.message.reply_text(
            f"🎉 *Discount Applied!*\n\n"
            f"✅ Code: {discount_code}\n"
            f"✅ Discount: {discount['discount_percent']}%\n"
            f"💰 Original Price: {original_price}\n"
            f"💰 Final Price: {final_price}\n\n"
            f"Now please enter your email address as registered on Nexa:",
            parse_mode='Markdown'
        )
        return ENTERING_EMAIL
    else:
        await update.message.reply_text(
            "❌ *Invalid Discount Code*\n\n"
            "The discount code is invalid, expired, or doesn't apply to this product.\n\n"
            "Please enter a valid discount code or type /cancel to continue without discount:",
            parse_mode='Markdown'
        )
        return APPLYING_DISCOUNT

# Email input
async def email_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    email = update.message.text.strip()
    
    # Basic email validation
    if '@' not in email or '.' not in email:
        await update.message.reply_text(
            f"📧 *[{context.user_data['product_name']}]*\n\n"
            "That doesn't look like a valid email address. Please enter a valid email:"
        )
        return ENTERING_EMAIL
    
    context.user_data['email'] = email
    
    price_info = ""
    if context.user_data.get('discount_code'):
        price_info = f"💰 *Final Price:* {context.user_data['final_price']} (with {context.user_data['discount_percent']}% discount)\n\n"
    
    await update.message.reply_text(
        f"👤 *[{context.user_data['product_name']}]*\n\n"
        f"📧 Email registered: {email}\n"
        f"{price_info}"
        "Now please enter your full name as registered on Nexa:",
        parse_mode='Markdown'
    )
    
    return ENTERING_NAME

# Name input
# In the name_input function, replace the crypto_options with this EXACT version:

async def name_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    full_name = update.message.text.strip()
    context.user_data['full_name'] = full_name

    # Create crypto selection keyboard - CORRECTED TO MATCH CRYPTO_ADDRESSES KEYS
    crypto_options = [
        ['Bitcoin', 'bitcoin'],
        ['Ethereum', 'ethereum'], 
        ['Solana', 'solana'],
        ['BNB Smart Chain', 'bnb_smart_chain'],  # This matches your dictionary
        ['USDT (Ethereum)', 'usdt_ethereum'],    # This matches your dictionary  
        ['USDC (Ethereum)', 'usdc_ethereum'],    # This matches your dictionary
        ['USDT (BNB)', 'usdt_bnb'],              # This matches your dictionary
        ['Dogecoin', 'doge'],                    # This matches your dictionary
        ['Tron', 'tron'],                        # This matches your dictionary
        ['Litecoin', 'ltc']                      # This matches your dictionary
    ]

    keyboard = []
    for crypto_name, crypto_key in crypto_options:
        keyboard.append([InlineKeyboardButton(crypto_name, callback_data=f"crypto_{crypto_key}")])
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    price_info = ""
    if context.user_data.get('discount_code'):
        price_info = f"💰 *Final Price:* {context.user_data['final_price']} (with {context.user_data['discount_percent']}% discount)\n\n"
    
    await update.message.reply_text(
        f"👤 *[{context.user_data['product_name']}]*\n\n"
        f"✅ Name registered: {full_name}\n"
        f"{price_info}"
        "Now please select the cryptocurrency you want to pay with:",
        reply_markup=reply_markup,
        parse_mode='Markdown'
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
    context.user_data['crypto_key'] = crypto_key
    context.user_data['wallet_address'] = wallet_address
    
    price_info = ""
    if context.user_data.get('discount_code'):
        price_info = f"💰 *Final Price:* {context.user_data['final_price']} (with {context.user_data['discount_percent']}% discount)\n\n"
    else:
        price_info = f"💰 *Price:* {context.user_data['current_price']}\n\n"
    
    await query.edit_message_text(
        f"💰 *[{context.user_data['product_name']}]*\n\n"
        f"✅ Payment method: {crypto_name}\n"
        f"{price_info}"
        f"📥 *Please send payment to this address:*\n"
        f"`{wallet_address}`\n\n"
        f"After sending the payment, please paste your Transaction Hash below for verification:",
        parse_mode='Markdown'
    )
    
    return ENTERING_TX_HASH

# Transaction hash input
async def tx_hash_input(update: Update, context: ContextTypes.DEFAULT_TYPE):
    tx_hash = update.message.text.strip()
    
    # Save order to database
    conn = sqlite3.connect('nexa_bot.db')
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
    
    # Mark discount code as used if applicable
    if context.user_data.get('discount_code'):
        mark_discount_used(context.user_data['discount_code'])
    
    # Prepare order data for notification
    order_data = {
        'order_id': order_id,
        'product_name': context.user_data['product_name'],
        'full_name': context.user_data['full_name'],
        'email': context.user_data['email'],
        'crypto_asset': context.user_data['crypto_asset'],
        'tx_hash': tx_hash,
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        'discount_code': context.user_data.get('discount_code'),
        'final_price': context.user_data.get('final_price', context.user_data['current_price'])
    }
    
    # Send Telegram notification
    notification_sent = await send_order_notification(context, order_data)
    
    if notification_sent:
        print("✅ Telegram notification sent successfully!")
    else:
        print("❌ Failed to send Telegram notification - check console for order details")
    
    # Build success message
    discount_info = ""
    if context.user_data.get('discount_code'):
        discount_info = f"🎫 *Discount Code:* {context.user_data['discount_code']} ({context.user_data['discount_percent']}% off)\n"
    
    success_message = f"""
🎉 *Payment Submitted Successfully!* [{context.user_data['product_name']}]

✅ *Order Details:*
• Product: {context.user_data['product_name']}
• Name: {context.user_data['full_name']}
• Email: {context.user_data['email']}
• Crypto: {context.user_data['crypto_asset']}
• TX Hash: `{tx_hash}`
{discount_info}• Amount: {context.user_data.get('final_price', context.user_data['current_price'])}

⏰ *What happens next?*
Your payment will be verified and your contract will be prepared and added within 24 hours.

📞 *Need help?*
If there's any issues, we'll reach out to you using the email provided.

💬 *Contact Support:*
• WhatsApp: https://wa.me/2349160209951
• Email: infocontactnexa@gmail.com

Thank you for choosing Nexa! 🚀
    """
    
    await update.message.reply_text(success_message, parse_mode='Markdown')
    
    # Clear user data
    context.user_data.clear()
    
    return ConversationHandler.END

# Test notification command
async def test_notification(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    test_data = {
        'order_id': 999,
        'product_name': 'TEST PRODUCT',
        'full_name': 'Test User',
        'email': 'test@test.com',
        'crypto_asset': 'Bitcoin',
        'tx_hash': 'TEST_HASH_123456789',
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    success = await send_order_notification(context, test_data)
    if success:
        await update.message.reply_text("✅ Test notification sent! Check your Telegram.")
    else:
        await update.message.reply_text("❌ Test notification failed! Check console for details.")

# Admin command to verify payment
async def verify_payment(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    if not context.args:
        await update.message.reply_text("❌ Usage: /verify <order_id>")
        return
    
    order_id = context.args[0]
    
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT user_id, product_name, full_name FROM orders 
        WHERE id = ? AND status = 'pending'
    ''', (order_id,))
    
    order = cursor.fetchone()
    
    if order:
        user_id, product_name, full_name = order
        
        # Update order status
        cursor.execute('''
            UPDATE orders SET status = 'verified', verified_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        ''', (order_id,))
        conn.commit()
        
        # Send success message to user
        success_msg = f"""
✅ *Payment Verified!* [{product_name}]

Great news! Your payment has been verified successfully. 

Your contract is now being prepared and will be added to your account shortly.

Thank you for your patience! If you have any questions, feel free to contact us.

Welcome to Nexa! 🎉
        """
        
        try:
            await context.bot.send_message(user_id, success_msg, parse_mode='Markdown')
            await update.message.reply_text(f"✅ Order {order_id} verified successfully! User notified.")
        except Exception as e:
            await update.message.reply_text(f"✅ Order verified but couldn't notify user: {e}")
    else:
        await update.message.reply_text("❌ Order not found or already verified.")
    
    conn.close()

# Admin command to add discount code
async def add_discount_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    if len(context.args) < 3:
        await update.message.reply_text(
            "❌ Usage: /addcode <CODE> <PERCENT> <DAYS> [PRODUCT_ID]\n\n"
            "Example:\n"
            "/addcode SUMMER20 20 30  (20% off all products for 30 days)\n"
            "/addcode PRODUCT10 10 15 2  (10% off product 2 for 15 days)"
        )
        return
    
    code = context.args[0].upper()
    discount_percent = float(context.args[1])
    days = int(context.args[2])
    product_id = context.args[3] if len(context.args) > 3 else 'all'
    
    expires_at = datetime.now() + timedelta(days=days)
    
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    try:
        cursor.execute('''
            INSERT INTO discount_codes (code, discount_percent, product_id, max_uses, expires_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (code, discount_percent, product_id, 1000, expires_at))
        
        conn.commit()
        
        product_info = f"for product {product_id}" if product_id != 'all' else "for all products"
        await update.message.reply_text(
            f"✅ Discount code `{code}` added successfully!\n"
            f"• Discount: {discount_percent}%\n"
            f"• Valid for: {days} days\n"
            f"• Scope: {product_info}\n"
            f"• Expires: {expires_at.strftime('%Y-%m-%d')}",
            parse_mode='Markdown'
        )
    except sqlite3.IntegrityError:
        await update.message.reply_text("❌ Discount code already exists.")
    
    conn.close()

# Admin command to delete discount code
async def delete_discount_code(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    if not context.args:
        await update.message.reply_text("❌ Usage: /deletecode <CODE>")
        return
    
    code = context.args[0].upper()
    
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('DELETE FROM discount_codes WHERE code = ?', (code,))
    conn.commit()
    
    if cursor.rowcount > 0:
        await update.message.reply_text(f"✅ Discount code `{code}` deleted successfully!", parse_mode='Markdown')
    else:
        await update.message.reply_text("❌ Discount code not found.")
    
    conn.close()

# List discount codes command
async def list_discount_codes(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT code, discount_percent, product_id, used_count, max_uses, expires_at, is_active 
        FROM discount_codes ORDER BY created_at DESC
    ''')
    
    codes = cursor.fetchall()
    conn.close()
    
    if codes:
        codes_text = "🎫 *Active Discount Codes:*\n\n"
        for code in codes:
            code_name, percent, product_id, used, max_uses, expires, active = code
            status = "✅ Active" if active else "❌ Inactive"
            product_scope = f"Product {product_id}" if product_id != 'all' else "All Products"
            codes_text += f"• `{code_name}`: {percent}% off {product_scope}\n"
            codes_text += f"  Used: {used}/{max_uses} | Expires: {expires[:10]} | {status}\n\n"
        
        await update.message.reply_text(codes_text, parse_mode='Markdown')
    else:
        await update.message.reply_text("No discount codes found.")

# List orders command
async def list_orders(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if str(update.effective_user.id) != ADMIN_CHAT_ID:
        await update.message.reply_text("❌ Admin access required.")
        return
    
    conn = sqlite3.connect('nexa_bot.db')
    cursor = conn.cursor()
    
    cursor.execute('''
        SELECT id, product_name, full_name, email, status, discount_code, final_price, created_at 
        FROM orders ORDER BY created_at DESC LIMIT 10
    ''')
    
    orders = cursor.fetchall()
    conn.close()
    
    if orders:
        orders_text = "📋 *Last 10 Orders:*\n\n"
        for order in orders:
            order_id, product, name, email, status, discount_code, final_price, created = order
            status_icon = "✅" if status == 'verified' else "⏳"
            discount_info = f" | 🎫 {discount_code}" if discount_code else ""
            orders_text += f"{status_icon} *Order {order_id}:* {product}\n"
            orders_text += f"   👤 {name} | 📧 {email} | 💰 {final_price}{discount_info}\n"
            orders_text += f"   🕒 {created}\n\n"
        
        await update.message.reply_text(orders_text, parse_mode='Markdown')
    else:
        await update.message.reply_text("No orders found.")

# Cancel command
async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "❌ Order process cancelled. You can start again with /start whenever you're ready!",
        parse_mode='Markdown'
    )
    context.user_data.clear()
    return ConversationHandler.END

# Error handler
async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    logger.error(f"Exception while handling an update: {context.error}")
    
    try:
        await update.message.reply_text(
            "😅 Sorry, something went wrong. Please start over with /start",
            parse_mode='Markdown'
        )
    except:
        pass

import os
import asyncio

def main():
    # Initialize database
    init_database()
    
    # Create application
    application = Application.builder().token(BOT_TOKEN).build()
    
    # Add all your handlers
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
    application.add_handler(CommandHandler('test', test_notification))
    application.add_handler(CommandHandler('verify', verify_payment))
    application.add_handler(CommandHandler('addcode', add_discount_code))
    application.add_handler(CommandHandler('deletecode', delete_discount_code))
    application.add_handler(CommandHandler('codes', list_discount_codes))
    application.add_handler(CommandHandler('orders', list_orders))
    application.add_handler(CommandHandler('status', status))
    application.add_error_handler(error_handler)
    
    print("🤖 Nexa Bot is starting...")
    
    # Use webhooks for Render
    if 'RENDER' in os.environ:
        # Webhook mode for production
        webhook_url = f"https://{os.environ.get('RENDER_EXTERNAL_HOSTNAME')}/{BOT_TOKEN}"
        application.run_webhook(
            listen="0.0.0.0",
            port=int(os.environ.get('PORT', 5000)),
            url_path=BOT_TOKEN,
            webhook_url=webhook_url
        )
    else:
        # Polling mode for local development
        application.run_polling()

if __name__ == '__main__':
    main()
