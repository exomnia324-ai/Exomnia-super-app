from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def home():
    return "🚀 Super App API is running"

@app.route("/status")
def status():
    return jsonify({
        "status": "online",
        "server": "python flask",
        "free_cloud": True
    })

if __name__ == "__main__":
    app.run()
