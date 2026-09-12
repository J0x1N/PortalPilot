export const demoTargetHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Northstar Customer Portal</title>
  <style>
    :root { color-scheme: light; font-family: Georgia, 'Times New Roman', serif; background: #edf1ed; color: #1d2a26; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: linear-gradient(140deg, #edf1ed, #d9e5dd); }
    header { padding: 28px 8vw 22px; background: #183b35; color: #f5f0e7; }
    header p { margin: 5px 0 0; color: #b9d2c5; font: 13px Arial, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
    main { width: min(720px, calc(100% - 32px)); margin: 42px auto; }
    .panel { padding: 32px; background: #fffdf8; border: 1px solid #c7d3c8; box-shadow: 0 18px 45px rgba(24, 59, 53, .12); }
    label { display: block; margin-bottom: 9px; color: #547066; font: 12px Arial, sans-serif; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .search { display: flex; gap: 10px; }
    input { min-width: 0; flex: 1; padding: 13px 15px; border: 1px solid #a9bdb2; border-radius: 3px; background: #fff; color: #183b35; font: 17px Georgia, serif; }
    button { padding: 13px 21px; border: 0; border-radius: 3px; background: #c96c45; color: white; cursor: pointer; font: 700 14px Arial, sans-serif; }
    button:hover { background: #a85232; }
    #result { margin-top: 28px; padding-top: 24px; border-top: 1px solid #d6dfd7; }
    #result[hidden] { display: none; }
    .eyebrow { margin: 0 0 7px; color: #c96c45; font: 700 12px Arial, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
    h1 { margin: 0; font-size: clamp(30px, 6vw, 52px); font-weight: 400; letter-spacing: -.02em; }
    h2 { margin: 0 0 22px; font-size: 23px; font-weight: 400; }
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 0; }
    dl div { padding: 16px; background: #eef4ef; }
    dt { margin-bottom: 7px; color: #547066; font: 11px Arial, sans-serif; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
    dd { margin: 0; font-size: 21px; }
    .notice { color: #a85232; font: 15px Arial, sans-serif; }
    @media (max-width: 560px) { .panel { padding: 24px; } .search { flex-direction: column; } dl { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <strong>Northstar</strong>
    <p>Enterprise customer portal / local demo</p>
  </header>
  <main>
    <section class="panel" aria-labelledby="page-title">
      <p class="eyebrow">Account lookup</p>
      <h1 id="page-title">Customer balance</h1>
      <form id="lookup-form">
        <label for="customer-id">Customer ID</label>
        <div class="search">
          <input id="customer-id" name="customer-id" autocomplete="off" placeholder="CUST-001" />
          <button id="search-button" type="submit">Search</button>
        </div>
      </form>
      <div id="result" hidden aria-live="polite">
        <h2 id="customer-name"></h2>
        <dl>
          <div><dt>Balance</dt><dd id="balance"></dd></div>
          <div><dt>Status</dt><dd id="status"></dd></div>
        </dl>
      </div>
    </section>
  </main>
  <script>
    const customers = {
      "CUST-001": { name: "ACME Corp", balance: "€1,245", status: "Active" },
      "CUST-002": { name: "Bluebird Logistics", balance: "€8,920", status: "Active" },
      "CUST-003": { name: "Cedar & Stone", balance: "€3,410", status: "Review" },
      "CUST-004": { name: "Delta Works", balance: "€12,780", status: "Active" },
      "CUST-005": { name: "Evergreen Foods", balance: "€2,095", status: "Pending" },
      "CUST-006": { name: "Fathom Systems", balance: "€18,300", status: "Active" },
      "CUST-007": { name: "Granite Studio", balance: "€740", status: "Active" },
      "CUST-008": { name: "Harbor Health", balance: "€6,615", status: "Review" },
      "CUST-009": { name: "Juniper Retail", balance: "€4,280", status: "Active" },
      "CUST-010": { name: "Lumen Energy", balance: "€21,050", status: "Pending" }
    };

    const form = document.querySelector('#lookup-form');
    const result = document.querySelector('#result');
    const recordingMode = new URLSearchParams(window.location.search).get('recording') === '1';
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const customer = customers[document.querySelector('#customer-id').value.trim().toUpperCase()];
      const renderResult = () => {
        result.replaceChildren();
        result.hidden = false;
        if (!customer) {
          const notice = document.createElement('p');
          notice.className = 'notice';
          notice.textContent = 'No customer record found.';
          result.append(notice);
          return;
        }

        const heading = document.createElement('h2');
        heading.id = 'customer-name';
        heading.textContent = customer.name;
        const details = document.createElement('dl');
        details.innerHTML = '<div><dt>Balance</dt><dd id="balance"></dd></div><div><dt>Status</dt><dd id="status"></dd></div>';
        result.append(heading, details);
        document.querySelector('#balance').textContent = customer.balance;
        document.querySelector('#status').textContent = customer.status;
      };

      if (recordingMode) {
        window.setTimeout(renderResult, 650);
      } else {
        renderResult();
      }
    });
  </script>
</body>
</html>`;
