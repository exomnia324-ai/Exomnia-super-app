from flask import Flask, render_template_string

app = Flask(__name__)

signin_html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EXOMNIA - Sign In</title>
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
            min-height: 100vh;
            background: #A8D0CF;
            padding: 20px;
            color: #1a1a2e;
        }

        .login-container {
            width: 100%;
            max-width: 420px;
            background: #ffffff;
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

        .input-group {
            margin-bottom: 25px;
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
            z-index: 2;
        }

        .input-with-icon select, .input-with-icon input {
            width: 100%;
            padding: 16px 16px 16px 48px;
            border-radius: 10px;
            border: 1px solid #ddd;
            font-size: 16px;
            transition: all 0.3s ease;
            background: white;
        }

        .input-with-icon select {
            cursor: pointer;
            appearance: none;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 16px center;
            background-size: 16px;
        }

        .input-with-icon select:focus, .input-with-icon input:focus {
            outline: none;
            border-color: #0E4950;
            box-shadow: 0 0 0 3px rgba(14, 73, 80, 0.2);
        }

        .phone-combined {
            display: flex;
            gap: 12px;
        }

        .phone-combined .input-with-icon {
            flex: 1;
        }

        .phone-combined .input-with-icon:last-child {
            flex: 2;
        }

        .btn {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 10px;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-top: 10px;
        }

        .btn-primary {
            background: #0E4950;
            color: white;
        }

        .btn-primary:hover {
            background: #0a363b;
            transform: translateY(-2px);
            box-shadow: 0 7px 15px rgba(14, 73, 80, 0.4);
        }

        .login-footer {
            text-align: center;
            margin-top: 20px;
            font-size: 15px;
            color: #6c757d;
        }

        .login-footer a {
            color: #0E4950;
            text-decoration: none;
            font-weight: 500;
        }

        .login-footer a:hover {
            text-decoration: underline;
        }

        .footer-links {
            display: flex;
            justify-content: center;
            gap: 20px;
            margin-top: 6px;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Security Features */
        .security-features {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 15px;
            margin-top: 20px;
            border-left: 4px solid #0E4950;
        }

        .security-features h4 {
            color: #0E4950;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .security-features ul {
            list-style: none;
            padding: 0;
        }

        .security-features li {
            padding: 5px 0;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
            .login-container {
                max-width: 100%;
            }

            .phone-combined {
                flex-direction: column;
            }

            .footer-links {
                flex-direction: column;
                gap: 5px;
            }
        }

        .error-message {
            color: #e74c3c;
            background: #fdf0f0;
            border: 1px solid #f8d7da;
            padding: 12px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
            font-size: 14px;
            display: none;
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
            <!-- Error Message -->
            <div class="error-message" id="errorMessage"></div>

            <!-- Login Form -->
            <form method="POST" id="loginForm">
                <div class="input-group">
                    <!-- Username/Email Input -->
                    <div class="input-with-icon">
                        <i class="fas fa-user"></i>
                        <input type="text" id="username" name="username" placeholder="Username or email" required>
                    </div>

                    <!-- Phone Input Combined -->
                    <div class="phone-combined">
                        <div class="input-with-icon">
                            <i class="fas fa-globe"></i>
                            <select id="country_code" name="country_code" required>
                                <option value="+880">🇧🇩 +880</option>
                                <option value="+91">🇮🇳 +91</option>
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+44">🇬🇧 +44</option>
                            </select>
                        </div>
                        <div class="input-with-icon">
                            <i class="fas fa-mobile-alt"></i>
                            <input type="tel" id="phone_number" name="phone_number" placeholder="Phone number" pattern="[0-9]*" inputmode="numeric" required>
                        </div>
                    </div>

                    <input type="hidden" name="phone" id="full_number">
                </div>

                <button type="submit" class="btn btn-primary" id="loginBtn">
                    <i class="fas fa-sign-in-alt"></i>
                    Sign In
                </button>
            </form>

            <div class="login-footer">
                <p>Don't have an account? <a href="#">Sign up</a></p>
                <div class="footer-links">
                    <a href="#">Help Center</a>
                    <a href="#">Privacy Policy</a>
                </div>
            </div>
        </div>
    </div>

    <script>
        // DOM Elements
        const loginForm = document.getElementById('loginForm');
        const phoneNumberInput = document.getElementById('phone_number');
        const countryCodeSelect = document.getElementById('country_code');
        const fullNumberInput = document.getElementById('full_number');
        const errorMessage = document.getElementById('errorMessage');

        // Show error message if any
        {% if error %}
            errorMessage.textContent = "{{ error }}";
            errorMessage.style.display = 'block';
        {% endif %}

        // Only allow numbers in phone field
        phoneNumberInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/[^0-9]/g, '');
        });

        // Combine country code and phone number
        function updateFullPhoneNumber() {
            const countryCode = countryCodeSelect.value;
            const phoneNumber = phoneNumberInput.value;
            fullNumberInput.value = countryCode + phoneNumber;
        }

        countryCodeSelect.addEventListener('change', updateFullPhoneNumber);
        phoneNumberInput.addEventListener('input', updateFullPhoneNumber);

        // Handle form submission
        loginForm.addEventListener('submit', function(e) {
            const phoneNumber = phoneNumberInput.value.trim();

            if (!phoneNumber) {
                e.preventDefault();
                errorMessage.textContent = "Please enter your phone number";
                errorMessage.style.display = 'block';
                return;
            }

            // Update the full phone number before submission
            updateFullPhoneNumber();

            // Show loading state
            const loginBtn = document.getElementById('loginBtn');
            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
            loginBtn.disabled = true;
        });
    </script>
</body>
</html>"""
 

@app.route("/")
def home():
    return render_template_string(signin_html)
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
