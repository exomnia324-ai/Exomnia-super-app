from flask import Flask, render_template_string

app = Flask(__name__)

HOME_HTML = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Exomnia Super App</title>
    <style>
        body {
            margin: 0;
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #0E4950, #A8D0CF);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 30px 25px;
            max-width: 360px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        }
        h1 {
            margin-bottom: 10px;
            font-size: 26px;
        }
        p {
            font-size: 14px;
            opacity: 0.9;
            margin-bottom: 25px;
        }
        .btn {
            display: block;
            width: 100%;
            padding: 14px;
            margin: 10px 0;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
            transition: 0.3s;
        }
        .btn-primary {
            background: #ffffff;
            color: #0E4950;
        }
        .btn-primary:hover {
            transform: scale(1.05);
        }
        .btn-secondary {
            background: transparent;
            color: white;
            border: 2px solid rgba(255,255,255,0.6);
        }
        .footer {
            margin-top: 20px;
            font-size: 12px;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Exomnia</h1>
        <p>The next-gen super app.<br>Chat • Social • Video • Market</p>

        <button class="btn btn-primary" onclick="alert('Login coming soon')">
            Login
        </button>

        <button class="btn btn-secondary" onclick="alert('Register coming soon')">
            Create Account
        </button>

        <div class="footer">
            © 2026 Exomnia • Built by founders
        </div>
    </div>
</body>
</html>
"""

@app.route("/")
def home():
    return render_template_string(HOME_HTML)
