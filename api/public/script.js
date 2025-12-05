let currentUser = null;
let chart = null;

const toast = (msg, ok = true) => {
  const t = document.createElement("div");
  t.className = `toast ${ok ? "success" : "error"}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
};

// FIX: Safer Helper function to format the date string (YYYY-MM-DD)
const formatDate = (dateString) => {
  if (!dateString) return '-';
  
  // Split the "YYYY-MM-DD" string into parts
  const parts = dateString.split('-');
  
  // Use parseInt to convert them to numbers
  const year = parseInt(parts[0], 10);
  // Month in Date constructor is 0-based (0 = Jan, 11 = Dec), so subtract 1
  const month = parseInt(parts[1], 10) - 1; 
  const day = parseInt(parts[2], 10);
  
  // FIX APPLIED HERE: Use Date.UTC() to initialize the date object.
  const date = new Date(Date.UTC(year, month, day)); 

  if (isNaN(date.getTime())) {
    return dateString;
  }

  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  
  return date.toLocaleDateString(undefined, options); 
};

const renderTable = data => {
  const body = document.getElementById("portfolioBody");
  if (!data || data.length === 0) {
    body.innerHTML = '<tr><td colspan="4" style="text-align:center">No transactions yet</td></tr>';
    return;
  }
  body.innerHTML = data.map(d => `
    <tr>
      <td>${formatDate(d.date)}</td> 
      <td><span class="action-badge ${d.action}">${d.action.toUpperCase()}</span></td>
      <td>${d.stock || '-'}</td>
      <td class="${['sell', 'invest'].includes(d.action) ? 'positive' : 'negative'}">
        ${['sell', 'invest'].includes(d.action) ? '+' : '-'}$${Math.abs(d.amount).toFixed(2)}
      </td>
    </tr>
  `).join("");
};

const renderChart = data => {
  const ctx = document.getElementById("profitChart");
  if (chart) chart.destroy();
  
  if (!data || data.length === 0) {
    return;
  }

  // Calculate running balance
  let balance = 0;
  const balanceData = [...data].reverse().map(d => {
    const change = ['sell', 'invest'].includes(d.action) ? d.amount : -d.amount;
    balance += change;
    return balance;
  });

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [...data].reverse().map(d => formatDate(d.date)),
      datasets: [{
        label: 'Balance ($)',
        data: balanceData,
        borderColor: "#00bcd4",
        backgroundColor: "rgba(0, 188, 212, 0.1)",
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#e3f2fd'
          }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return 'Balance: $' + context.parsed.y.toFixed(2);
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: false,
          ticks: {
            color: '#e3f2fd',
            callback: function(value) {
              return '$' + value.toFixed(0);
            }
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        },
        x: {
          ticks: {
            color: '#e3f2fd'
          },
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          }
        }
      }
    }
  });
};

const updateStockFieldVisibility = () => {
  const action = document.getElementById("action").value;
  const stockInput = document.getElementById("stock");
  
  if (action === "invest" || action === "withdraw") {
    stockInput.style.display = "none";
    stockInput.required = false;
    stockInput.value = "";
  } else {
    stockInput.style.display = "block";
    stockInput.required = true;
  }
};

document.getElementById("show-register-btn").onclick = () => {
  document.getElementById("register-view").classList.add("active-form");
  document.getElementById("register-view").classList.remove("hidden-form");
  document.getElementById("login-view").classList.remove("active-form");
  document.getElementById("login-view").classList.add("hidden-form");
  document.getElementById("show-register-btn").classList.add("active-tab");
  document.getElementById("show-login-btn").classList.remove("active-tab");
};

document.getElementById("show-login-btn").onclick = () => {
  document.getElementById("login-view").classList.add("active-form");
  document.getElementById("login-view").classList.remove("hidden-form");
  document.getElementById("register-view").classList.remove("active-form");
  document.getElementById("register-view").classList.add("hidden-form");
  document.getElementById("show-login-btn").classList.add("active-tab");
  document.getElementById("show-register-btn").classList.remove("active-tab");
};

document.getElementById("register-form").onsubmit = async e => {
  e.preventDefault();
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  
  if (!username || !password) {
    toast("Please fill in all fields", false);
    return;
  }

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    toast(data.message, data.success);
    
    if (data.success) {
      document.getElementById("reg-username").value = "";
      document.getElementById("reg-password").value = "";
      // Switch to login view
      document.getElementById("show-login-btn").click();
    }
  } catch (error) {
    toast("Registration failed. Please try again.", false);
  }
};

document.getElementById("login-form").onsubmit = async e => {
  e.preventDefault();
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  
  if (!username || !password) {
    toast("Please fill in all fields", false);
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    
    if (data.success) {
      currentUser = data.username;
      document.getElementById("auth-section").classList.add("hidden");
      document.getElementById("dashboard").classList.remove("hidden");
      document.getElementById("logout-btn").classList.remove("hidden");
      document.getElementById("current-user-display").classList.remove("hidden");
      document.getElementById("current-user-display").textContent = `Welcome, ${data.username}`;
      document.getElementById("accountTotal").textContent = `${data.totalBalance.toFixed(2)}`;
      
      // Hide login and register buttons
      document.getElementById("show-login-btn").classList.add("hidden");
      document.getElementById("show-register-btn").classList.add("hidden");
      
      // Set today's date as default
      document.getElementById("date").valueAsDate = new Date();
      
      renderTable(data.portfolio);
      renderChart(data.portfolio);
      updateStockFieldVisibility();
      toast("Login successful!");
    } else {
      toast(data.message, false);
    }
  } catch (error) {
    toast("Login failed. Please try again.", false);
  }
};

document.getElementById("action").addEventListener("change", updateStockFieldVisibility);

document.getElementById("addTradeBtn").onclick = async () => {
  const date = document.getElementById("date").value;
  const stock = document.getElementById("stock").value.trim();
  const amount = parseFloat(document.getElementById("amount").value);
  const action = document.getElementById("action").value;
  
  if (!date) {
    toast("Please select a date", false);
    return;
  }
  
  if ((action === "buy" || action === "sell") && !stock) {
    toast("Please enter a stock symbol", false);
    return;
  }
  
  if (!amount || amount <= 0) {
    toast("Please enter a valid amount", false);
    return;
  }

  try {
    const res = await fetch("/api/trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        date, 
        stock: stock || null, 
        amount, 
        action, 
        user: currentUser 
      })
    });
    const data = await res.json();
    
    if (data.success) {
      renderTable(data.portfolio);
      renderChart(data.portfolio);
      document.getElementById("accountTotal").textContent = `$${data.totalBalance.toFixed(2)}`;
      
      // Clear form
      document.getElementById("stock").value = "";
      document.getElementById("amount").value = "";
      
      toast("Transaction added successfully!");
    } else {
      toast(data.message, false);
    }
  } catch (error) {
    toast("Transaction failed. Please try again.", false);
  }
};

document.getElementById("logout-btn").onclick = () => {
  currentUser = null;
  document.getElementById("dashboard").classList.add("hidden");
  document.getElementById("auth-section").classList.remove("hidden");
  document.getElementById("logout-btn").classList.add("hidden");
  document.getElementById("current-user-display").classList.add("hidden");
  
  // FIX: Make sure the login/register buttons reappear
  document.getElementById("show-login-btn").classList.remove("hidden");
  document.getElementById("show-register-btn").classList.remove("hidden");

  // Clear forms
  document.getElementById("login-username").value = "";
  document.getElementById("login-password").value = "";
  
  if (chart) {
    chart.destroy();
    chart = null;
  }
  
  toast("Logged out successfully");
};