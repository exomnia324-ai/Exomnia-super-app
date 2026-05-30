# ========================================
# এই routes গুলো আপনার app.py তে যোগ করুন
# ========================================

@app.route('/privacy-policy')
def privacy_policy():
    return render_template('privacy_policy.html')

@app.route('/terms')
def terms():
    return render_template('terms.html')

@app.route('/contact')
def contact():
    return render_template('contact.html')

@app.route('/how-to-play')
def how_to_play():
    return render_template('how_to_play.html')

@app.route('/about')
def about():
    return render_template('about.html')
