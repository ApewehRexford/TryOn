import os

from flask import Flask, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="/static")


@app.route("/")
def index():
    # Served as a plain file (not a Jinja template) so JS `${}` / `{{` never collide with templating.
    return send_from_directory(app.static_folder, "index.html")


@app.after_request
def security_headers(resp):
    resp.headers["Permissions-Policy"] = "camera=(self)"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


if __name__ == "__main__":
    # Debug mode exposes the Werkzeug debugger (remote code execution) — never enable it by default,
    # especially when the server is tunnelled publicly through ngrok.
    debug = os.environ.get("FLASK_DEBUG") == "1"
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port, debug=debug)
