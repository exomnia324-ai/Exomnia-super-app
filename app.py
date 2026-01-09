from flask import Flask, jsonify

app = Flask(__name__)

@app.route("/")
def home():
    return "Exomnia cloud server is run, founder-supriyo dolui,ceo& co-founder-dipanjan khamrui"

@app.route("/status")
def status():
    return jsonify({
        "status": "online",
        "server": "python flask",
        "free_cloud": True
    })

if __name__ == "__main__":
    app.run()
