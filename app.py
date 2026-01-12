from flask import Flask, render_template_string

app = Flask(__name__)

signin_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EXOMNIA - Sign In</title>

    <!-- Font Awesome -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100svh; /* FIXED */
            background: #A8D0CF;
            padding: 20px;
            color: #1a1a2e;
            overflow-x: hidden;
        }

        .login-container {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
            color: #1a1a2e;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.15);
            animation: fadeIn 0.5s ease-out;
        }

        .login-header {
            background: #0E4950;
            color: white;
            padding: 35px 25px;
            text-align: center;
            position: relative;
        }

        .login-header::after {
            content: '';
            position: absolute;
            bottom: -15px;
            left: 0;
            width: 100%;
            height: 30px;
            background: #ffffff;
            border-radius: 50% 50% 0 0;
        }

        .logo {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 12px;
        }

        .logo i {
            font-size: 32px;
        }

        .logo h1 {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: 1px;
        }

        .login-header p {
            font-size: 16px;
            opacity: 0.9;
            margin-top: 5px;
        }

        .login-body {
            padding: 40px 30px 30px;
        }

        .input-with-icon {
            position: relative;
            margin-bottom: 20px;
        }

        .input-with-icon i {
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: #6c757d;
        }

        .input-with-icon input,
        .input-with-icon select {
            width: 100%;
            padding: 16px 16px 16px 48px;
            border-radius: 10px;
            border: 1px solid #ddd;
            font-size: 16px;
        }

        .phone-combined {
            display: flex;
            gap: 12px;
        }

        .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 10px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            background: #0E4950;
            color: white;
            margin-top: 10px;
        }

        .btn:hover {
            background: #0a363b;
        }

        .login-footer {
            text-align: center;
            margin-top: 20px;
            font-size: 15px;
            color: #6c757d;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>

<body>
    <div class="login-container">
        <div class="login-header">
            <div class="logo">
                <i class="fas fa-lock"></i>
                <h1>Sign in EXOMNIA</h1>
            </div>
            <p>Enter your phone number to continue</p>
        </div>

        <div class="login-body">
            <form>
                <div class="input-with-icon">
                    <i class="fas fa-user"></i>
                    <input type="text" placeholder="Username or email" required>
                </div>

                <div class="phone-combined">
                    <div class="input-with-icon">
                        <i class="fas fa-globe"></i>
                        <select>
                            <option>+880</option>
                            <option>+91</option>
                            <option>+1</option>
                        </select>
                    </div>

                    <div class="input-with-icon">
                        <i class="fas fa-mobile-alt"></i>
                        <input type="tel" placeholder="Phone number" required>
                    </div>
                </div>

                <button class="btn">Sign In</button>
            </form>

            <div class="login-footer">
                Don’t have an account? <a href="#">Sign up</a>
            </div>
        </div>
    </div>
</body>
</html>
"""

@app.route("/")
def home():
    return render_template_string(signin_html)

@app.route("/health")
def health():
    return "OK"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
