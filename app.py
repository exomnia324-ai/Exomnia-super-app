from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "The work on the Exomnia Super App is underway, and the app will be made available to the general public very soon."

if __name__ == "__main__":
    app.run()
