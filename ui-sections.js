// ui-sections.js - PART 1 (HTML Templates)
// RESPONSIBILITY: Store HTML Strings for "In-Page" Navigation
// NOTE: Is file ko index.html me import karna hoga.

export const SectionTemplates = {

    // =================================================================
    // SECTION 1: LOAN DASHBOARD (HTML Structure)
    // =================================================================
    getLoanDashboardHTML: () => `
        <div class="main-wrapper animate-on-scroll">
            <header class="premium-header">
                <span class="header-super-title">Trust Community Fund</span>
                <h1 class="header-main-title">Loan Dashboard</h1>
                <button id="generate-credit-btn">
                    <i data-feather="credit-card"></i> Generate Card
                </button>
            </header>

            <div class="stats-wrapper">
                <div class="combined-stats-card">
                    <div class="stat-part">
                        <div class="stat-label">Outstanding Loans</div>
                        <div class="stat-value" id="count-val">0</div>
                    </div>
                    <div class="stat-separator"></div>
                    <div class="stat-part">
                        <div class="stat-label">Total Due</div>
                        <div class="stat-value" id="amount-val">₹0</div>
                    </div>
                </div>
            </div>

            <div class="search-area">
                <input type="text" id="search-input" placeholder="Search member by name..." autocomplete="off">
            </div>

            <div id="loader" class="hidden">
                <div class="spinner"></div>
                <span class="loading-text">Loading Active Loans...</span>
            </div>

            <div id="outstanding-loans-container">
                </div>
        </div>

        <div class="modal-overlay" id="gen-modal">
            <div class="modal-box">
                <button class="close-modal">&times;</button>
                <h3 class="modal-title">GENERATE CARD</h3>

                <div class="form-group">
                    <label>Member</label>
                    <select id="m-select" class="form-control"><option value="">Loading...</option></select>
                </div>

                <div class="form-group">
                    <label>Type</label>
                    <select id="t-select" class="form-control">
                        <option value="credit">10 Days Credit</option>
                        <option value="recharge">Recharge</option>
                    </select>
                </div>

                <div class="form-group" id="amt-group">
                    <label>Outstanding Amount</label>
                    <input type="number" id="amt-input" class="form-control" disabled placeholder="Select member first">
                </div>

                <div class="form-group" id="prov-group" style="display:none;">
                    <label>Operator</label>
                    <select id="prov-select" class="form-control">
                        <option>Jio</option><option>Airtel</option><option>Vi</option><option>BSNL</option>
                    </select>
                </div>

                <button class="btn-gen" id="btn-create">Create Card</button>
                <div id="gen-result" style="margin-top:20px;"></div>
            </div>
        </div>
    `,

    // =================================================================
    // SECTION 2: HISTORY & NOTIFICATIONS (HTML Structure)
    // =================================================================
    getHistoryHTML: () => `
        <div class="main-wrapper animate-on-scroll" style="padding-top: 10px;">
            <header class="header">
                <h1 style="flex:1;">History & Dues</h1>
                <div class="history-month-badge">
                    <i data-feather="calendar"></i>
                    <span id="monthDisplay">Current Month</span>
                </div>
            </header>

            <div class="tabs-container">
                <div class="tabs">
                    <button class="tab active" data-subtab="history">Transactions</button>
                    <button class="tab" data-subtab="due">Dues</button>
                    <button class="tab" data-subtab="notices">Notices</button>
                </div>
            </div>

            <div id="subtab-history" class="content active">

                <div class="history-boxes">
                    <div class="h-box sip">
                        <span class="h-lbl">SIP Rec.</span>
                        <span class="h-val" id="totalSipVal">₹0</span>
                    </div>
                    <div class="h-box repay">
                        <span class="h-lbl">Repayment</span>
                        <span class="h-val" id="totalRepayVal">₹0</span>
                    </div>
                    <div class="h-box loan">
                        <span class="h-lbl">Loan Given</span>
                        <span class="h-val" id="totalLoanVal">₹0</span>
                    </div>
                </div>

                <div class="sub-filter-container">
                    <button class="filter-chip active" data-filter="ALL">All</button>
                    <button class="filter-chip" data-filter="SIP">SIP Rank 🏆</button>
                    <button class="filter-chip" data-filter="LOAN">Loan</button>
                    <button class="filter-chip" data-filter="REPAY">Repayment</button>
                </div>

                <div id="historyContainer" class="hist-list">
                    <p class="loading-text">Loading transactions...</p>
                </div>
            </div>

            <div id="subtab-due" class="content">
                <div id="sipContainer"></div>
                <div id="loanContainer">
                    <p class="loading-text">Checking dues...</p>
                </div>
            </div>

            <div id="subtab-notices" class="content">
                <div id="noticesContainer"></div>
            </div>
        </div>
    `,

    // =================================================================
    // SECTION 3: FULL PROFILE VIEW (HTML Structure)
    // =================================================================
    getProfileHTML: () => `
        <div class="main-wrapper animate-on-scroll">
            <div id="fullProfileViewModal" class="full-profile-container">
                <div class="profile-header-card">
                    <button class="close-profile-btn" onclick="window.history.back()">&times;</button>
                    <img id="fullProfilePic" src="" alt="Profile Photo" class="fp-big-img">
                    <h2 id="fullProfileName">Member Name</h2>
                    <span id="fullProfileId" class="fp-id-badge">ID: --</span>
                </div>

                <div class="full-profile-body">
                    <div class="full-profile-grid">
                        <div class="full-profile-item">
                            <strong>Mobile</strong>
                            <span id="fullProfileMobile">--</span>
                        </div>
                        <div class="full-profile-item">
                            <strong>DOB</strong>
                            <span id="fullProfileDob">--</span>
                        </div>
                        <div class="full-profile-item">
                            <strong>Aadhaar</strong>
                            <span id="fullProfileAadhaar">--</span>
                        </div>
                        <div class="full-profile-item full-width">
                            <strong>Address</strong>
                            <span id="fullProfileAddress">--</span>
                        </div>
                         <div class="full-profile-item full-width extra-amt-box">
                            <strong>Extra Amount</strong>
                            <span id="fullProfileExtraAmount">--</span>
                        </div>
                    </div>

                    <div class="full-profile-docs">
                        <h3>Documents</h3>
                        <div class="doc-row">
                            <div class="doc-item">
                                <span>KYC Document</span>
                                <img id="fullProfileDoc" src="" alt="Document" onclick="window.viewImage(this.src)">
                            </div>
                            <div class="doc-item">
                                <span>Signature</span>
                                <img id="fullProfileSign" src="" alt="Signature" onclick="window.viewImage(this.src)">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
};
