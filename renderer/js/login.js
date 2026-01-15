// login.js

const form = document.getElementById("loginForm");
const error = document.getElementById("error");
const pageLoader = document.getElementById("pageLoader");

const btn = document.getElementById("loginBtn");
const btnText = btn.querySelector(".btn-text");
const btnSpinner = btn.querySelector(".btn-spinner");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  error.textContent = "";

  // Button loading
  btn.disabled = true;
  btnText.style.visibility = "hidden";
  btnSpinner.style.display = "block";

  // Full page loader
  pageLoader.classList.remove("hidden");

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const user = await window.api.login({ email, password });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    // ✅ FIX: Store employee email in localStorage
    localStorage.setItem("employeeEmail", email);

    // Navigate to dashboard
    window.api.loginSuccess();

  } catch (err) {
    error.textContent = err.message || "Login failed";

    btn.disabled = false;
    btnText.style.visibility = "visible";
    btnSpinner.style.display = "none";
    pageLoader.classList.add("hidden");
  }
});