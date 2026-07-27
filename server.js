const cron = require('node-cron');
const express = require('express');
const session = require('express-session');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const ExcelJS = require('exceljs');
const twilio = require('twilio');
const mongoose = require('mongoose');

// Folder Initialization
if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
if (!fs.existsSync('completed_files')) { fs.mkdirSync('completed_files'); }
if (!fs.existsSync('archive')) { fs.mkdirSync('archive'); }

function saveCompletedFile(complaint) {
    const fileName = `./completed_files/${complaint.grievanceId}.json`;
    fs.writeFileSync(fileName, JSON.stringify(complaint, null, 2));
}

const app = express();

// Static Files & Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Configuration
app.use(session({
    secret: 'super-secret-key-123',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 Day
}));

// Views Configuration
app.set('views', path.resolve(__dirname, 'Views'));
app.set('view engine', 'ejs');

// Mongoose Schemas Definition
const grievanceSchema = new mongoose.Schema({
    grievanceId: String,
    citizenName: String,
    citizenMobile: String,
    fieldNotes: { type: String, default: "" },
    resolvedImage: { type: String, default: "" }
}, { timestamps: true });

const Complaint = mongoose.model('Complaint', grievanceSchema);

const userSchema = new mongoose.Schema({
    resolvedCount: { type: Number, default: 0 },
    points: { type: Number, default: 0 }
});
const User = mongoose.model('User', userSchema);

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => { cb(null, 'uploads/'); },
    filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
});

const uploadFields = multer({ storage: storage }).fields([
    { name: 'complaintMedia', maxCount: 1 },
    { name: 'complaintLetter', maxCount: 1 }
]);

const resolutionFields = multer({ storage: storage }).fields([
    { name: 'beforeImage', maxCount: 1 },
    { name: 'afterImage', maxCount: 1 }
]);

let activeOTPs = {};

// Twilio Credentials
const accountSid = 'YOUR_TWILIO_ACCOUNT_SID'; 
const authToken = 'YOUR_TWILIO_AUTH_TOKEN';   
const twilioPhoneNumber = 'YOUR_TWILIO_PHONE_NUMBER';

function sendNotification(phoneNumber, message, isWhatsApp = false) {
    try {
        if(accountSid === 'YOUR_TWILIO_ACCOUNT_SID') {
            console.log(`[MOCK ALERT] TO: ${phoneNumber} | MSG: ${message}`);
            return;
        }
        const client = new twilio(accountSid, authToken);
        const fromNumber = isWhatsApp ? 'whatsapp:+14155238886' : twilioPhoneNumber;
        const toNumber = isWhatsApp ? `whatsapp:${phoneNumber}` : phoneNumber;

        client.messages.create({ body: message, from: fromNumber, to: toNumber })
        .then(msg => console.log(`Notification sent successfully! SID: ${msg.sid}`))
        .catch(err => console.error('Twilio Error:', err.message));
    } catch (e) {
        console.log('Notification skipped or config error:', e.message);
    }
}

function sendWhatsAppMediaNotification(phoneNumber, message, mediaUrl) {
    try {
        if(accountSid === 'YOUR_TWILIO_ACCOUNT_SID') {
            console.log(`[MOCK WHATSAPP MEDIA] TO: ${phoneNumber} | MSG: ${message} | MEDIA: ${mediaUrl}`);
            return;
        }
        const client = new twilio(accountSid, authToken);
        
        client.messages.create({
            body: message,
            from: 'whatsapp:+14155238886',
            to: `whatsapp:${phoneNumber}`,
            mediaUrl: [mediaUrl]
        })
        .then(msg => console.log(`WhatsApp Media Sent! SID: ${msg.sid}`))
        .catch(err => console.error('Twilio WhatsApp Error:', err.message));
    } catch (e) {
        console.log('WhatsApp Media Error:', e.message);
    }
}

const wardList = {
    "Anna Nagar": ["Ward 12", "Ward 13", "Ward 14", "Ward 15"],
    "Kolathur": ["Ward 24", "Ward 25", "Ward 26", "Ward 27"]
};

// 📜 திருக்குறள் பட்டியல் (Global Level)
const thirukkurals = [
    {
        kural: "செயற்கரிய செய்வார் பெரியர் சிறியர்<br>செயற்கரிய செய்கலாதார்.",
        explanation: "செய்வதற்கு அருமையான செயல்களைச் செய்து முடிப்பவரே பெரியோர்; செய்ய முடியாது என்று பின்வாங்குபவர் சிறியோர்."
    },
    {
        kural: "அகர முதல எழுத்தெல்லாம் ஆதி<br>பகவன் முதற்றே உலகு.",
        explanation: "எழுத்துக்கள் எல்லாம் 'அ' கரத்தை முதலாவதாகக் கொண்டுள்ளன; அதுபோல உலகம் இறைவனை முதலாகக் கொண்டுள்ளது."
    },
    {
        kural: "மனத்துக்கண் மாசிலன் ஆதல் அனைத்தறன்<br>ஆகுல நீர பிற.",
        explanation: "மனதில் குற்றம் இல்லாமல் இருப்பது தான் சிறந்த அறம்; மற்றவை எல்லாம் வெறும் ஆரவாரமே."
    }
];

let complaintsList = [
    { 
        id: 1,
        grievanceId: "GRIEV-2026-1001",
        citizenName: "Anbarasan",
        citizenMobile: "+919845123456",
        citizenEmail: "anbu@gmail.com",
        district: "Chennai",
        constituency: "Anna Nagar", 
        municipality: "Chennai Corporation",
        wardZone: "Ward 12",
        streetName: "Anna Nagar 3rd Street",
        googleMapLocation: "13.0850, 80.2120",
        landmark: "Anna Nagar Tower",
        grievanceCategory: "சாலை பழுது",
        description: "Water Pipeline Leakage broke the road completely.", 
        status: "Pending_Managaram", 
        mediaFile: "", 
        letterFile: "",
        created_date: "2026-06-12",
        priority: "Normal",
        forwardedTo: "",
        beforeImage: "",
        afterImage: "",
        appreciation: "",
        certificateIssued: false,
        deadline: null, 
        delayJustification: "" 
    }
];

app.get('/', (req, res) => {
    if (req.session && req.session.isLoggedIn) {
        let activeComplaints = complaintsList.filter(c => !c.isArchived);
        let filteredComplaints = [];

        if (req.session.userRole === 'MLA') {
            filteredComplaints = activeComplaints.filter(c => {
                const matchedConstituency = c.constituency && req.session.constituency && 
                    c.constituency.replace(/\s+/g, '').toLowerCase() === req.session.constituency.replace(/\s+/g, '').toLowerCase();
                
                return matchedConstituency && (c.recipient === 'MLA' || !c.recipient);
            });
        } else if (req.session.userRole === 'Poruppalar') {
            filteredComplaints = activeComplaints.filter(c => {
                const matchedConstituency = c.constituency && req.session.constituency && 
                    c.constituency.replace(/\s+/g, '').toLowerCase() === req.session.constituency.replace(/\s+/g, '').toLowerCase();

                return matchedConstituency && (c.recipient === 'Poruppalar' || c.forwardedTo);
            });
        } else if (req.session.userRole === 'CM') {
            filteredComplaints = activeComplaints.filter(c => c.recipient === 'CM');
        } else {
            filteredComplaints = activeComplaints;
        }

        const totalCount = filteredComplaints.length;
        const pendingCount = filteredComplaints.filter(c => c.status && c.status.startsWith('Pending')).length;
        const resolvedCount = filteredComplaints.filter(c => c.status === 'Resolved' || c.status === 'Completed').length;

        // திருக்குறள் Logic
        const today = new Date();
        const startOfYear = new Date(today.getFullYear(), 0, 0);
        const diff = today - startOfYear;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayOfYear = Math.floor(diff / oneDay);
        const todayKural = thirukkurals[dayOfYear % thirukkurals.length];

        res.render('dashboard', { 
            complaints: filteredComplaints, 
            complaintsList: complaintsList,
            currentRole: req.session.userRole, 
            constituency: req.session.constituency || null, 
            wardList: wardList, 
            successId: req.query.successId,
            req: req,
            totalCount: totalCount,
            pendingCount: pendingCount,
            resolvedCount: resolvedCount,
            points: req.session.points || 0,
            todayKural: todayKural
        });
    } else {
        res.redirect('/login');
    }
});

app.get('/dashboard', (req, res) => { res.redirect('/'); });    

app.get('/check-status', (req, res) => {
    const { grievanceId } = req.query;
    let statusResult = null;
    let error = null;

    if (grievanceId) {
        const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
        if (complaint) { 
            statusResult = complaint; 
        } else { 
            error = "மன்னிக்கவும், இந்த ID-க்கு புகார்கள் ஏதுமில்லை!"; 
        }
    }
    res.render('check_status', { statusResult, error, grievanceId });
});

// Login Page GET Route
app.get('/login', (req, res) => {
    const filePath = path.join(__dirname, 'announcements.json');

    let announcements = [];

    if (fs.existsSync(filePath)) {
        try {
            const fileData = fs.readFileSync(filePath, 'utf-8');
            announcements = JSON.parse(fileData);
        } catch (err) {
            console.error("Error reading JSON file:", err);
        }
    }

    res.render('login', { announcements: announcements });
});

// MLA புதிய அறிவிப்பைச் சேர்க்கும்போது (POST Route)
app.post('/add-announcement', (req, res) => {
    const { content } = req.body;
    const filePath = path.join(__dirname, 'announcements.json');

    let announcements = [];

    if (fs.existsSync(filePath)) {
        try {
            const fileData = fs.readFileSync(filePath, 'utf-8');
            const parsedData = JSON.parse(fileData);

            // parsedData உண்மையிலேயே Array தானா என்று சரிபார்க்கிறோம்
            if (Array.isArray(parsedData)) {
                announcements = parsedData;
            } else {
                announcements = []; // Array இல்லையென்றால் Empty Array
            }
        } catch (err) {
            console.error("Error reading JSON file:", err);
            announcements = [];
        }
    }

    if (content) {
        const newNotice = {
            date: new Date().toISOString().split('T')[0],
            content: content
        };
        
        // Safe-ஆ unshift செய்கிறோம்
        if (Array.isArray(announcements)) {
            announcements.unshift(newNotice);
        } else {
            announcements = [newNotice];
        }

        try {
            fs.writeFileSync(filePath, JSON.stringify(announcements, null, 4), 'utf-8');
        } catch (err) {
            console.error("Error writing to JSON file:", err);
        }
    }

    // வந்த பக்கத்திற்கே திரும்ப அழைத்துச் செல்லும்
    res.redirect('back'); 
});

app.post('/send-otp', (req, res) => {
    const { mobileNumber } = req.body;
    if (!mobileNumber) return res.json({ success: false, message: 'மொபைல் எண் தேவை!' });
    const mockOTP = "1234";
    activeOTPs[mobileNumber] = mockOTP;
    res.json({ success: true, message: 'OTP வெற்றிகரமாக அனுப்பப்பட்டது! (டெஸ்ட் OTP: 1234)' });
});

app.post('/login', (req, res) => {
    const { loginType, mobileNumber, otp, username, password, recipient } = req.body;

    if (loginType === 'public') {
        if (otp === "1234" || activeOTPs[mobileNumber] === otp) {
            req.session.isLoggedIn = true;
            req.session.userRole = 'Public';
            req.session.userMobile = mobileNumber;
            req.session.recipient = recipient;
            delete activeOTPs[mobileNumber];
            return res.redirect('/');
        } else {
            return res.send("<script>alert('தவறான OTP எண்!'); window.location.href='/login';</script>");
        }
    } else if (loginType === 'official') {
        if ((username === 'mla_annanagar' || username === 'mla') && password === 'mla123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'MLA';
            req.session.constituency = 'Anna Nagar';
            return res.redirect('/');
        } else if (username === 'mla_kolathur' && password === 'mla123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'MLA';
            req.session.constituency = 'Kolathur';
            return res.redirect('/');
        } else if (username === 'poruppalar_annanagar' && password === 'poruppalar123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'Poruppalar';
            req.session.constituency = 'Anna Nagar';
            return res.redirect('/');
        } else if (username === 'poruppalar_kolathur' && password === 'poruppalar123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'Poruppalar';
            req.session.constituency = 'Kolathur';
            return res.redirect('/');
        } else if (username === 'cm' && password === 'cm123') {
            req.session.isLoggedIn = true;
            req.session.userRole = 'CM';
            req.session.constituency = 'All State';
            return res.redirect('/');
        } else {
            return res.send("<script>alert('தவறான பயனர் பெயர் / கடவுச்சொல்!'); window.location.href='/login';</script>");
        }
    }
    res.redirect('/login');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

app.post('/submit-complaint', uploadFields, (req, res) => {
    const { citizenName, citizenMobile, citizenEmail, district, constituency, ward, streetName, googleMapLocation, grievanceCategory, recipient, description, department } = req.body || {};

    const nextNumber = complaintsList.length + 1;
    const grievanceNumber = `GRIEV-2026-${String(nextNumber).padStart(4, '0')}`;

    const mediaFile = req.files && req.files['complaintMedia'] ? req.files['complaintMedia'][0].filename : "";
    const letterFile = req.files && req.files['complaintLetter'] ? req.files['complaintLetter'][0].filename : "";

    const assignedRecipient = recipient ? recipient : 'MLA';

    const newComplaint = {
        id: nextNumber,
        grievanceId: grievanceNumber,
        citizenName: citizenName || 'பெயர் இல்லை',
        citizenMobile: citizenMobile || '',
        citizenEmail: citizenEmail || '',
        district: district || '',
        wardZone: ward || '',
        constituency: constituency || req.session.constituency || 'Anna Nagar',
        streetName: streetName || '',
        googleMapLocation: googleMapLocation || '',
        grievanceCategory: grievanceCategory || 'பொதுவான புகார்',
        department: department || '',
        recipient: assignedRecipient,
        description: description || 'விவரம் எதுவும் குறிப்பிடப்படவில்லை',
        status: 'Pending_Managaram',
        mediaFile: mediaFile,
        letterFile: letterFile,
        created_date: new Date().toISOString().split('T')[0]
    };

    complaintsList.push(newComplaint);
    res.redirect('/?successId=' + grievanceNumber);
});

app.post('/update-status', (req, res) => {
    if (!req.session || !req.session.isLoggedIn || req.session.userRole === 'Public') {
        return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    }
    const { grievanceId, newStatus } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    if (complaint) {
        complaint.status = newStatus;
        const statusMsg = `உங்கள் மனு எண்: ${grievanceId}-ன் நிலை தற்போது "${newStatus}" என மாற்றப்பட்டுள்ளது.`;
        sendNotification(complaint.citizenMobile, statusMsg, false);
        return res.send("<script>alert('மனுவின் நிலை வெற்றிகரமாக மாற்றப்பட்டது!'); window.location.href='/';</script>");
    } else {
        return res.send("<script>alert('மனு எண் கண்டறியப்படவில்லை!'); window.location.href='/';</script>");
    }
});

app.post('/update-grievance-details', (req, res) => {
    const { grievanceId, priority, department, deadlineHours } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.priority = priority || "Normal";
        complaint.forwardedTo = department;
        complaint.status = "In_Progress"; 
        
        if (deadlineHours) {
            const hours = parseInt(deadlineHours);
            complaint.deadline = Date.now() + (hours * 60 * 60 * 1000);
        }

        const forwardMsg = `உங்கள் மனு எண்: ${grievanceId} தற்போது உரிய துறைக்கு (${department}) அனுப்பப்பட்டு நடவடிக்கை எடுக்கப்பட்டு வருகிறது. காலக்கெடு: ${deadlineHours} மணிநேரம்.`;
        sendNotification(complaint.citizenMobile, forwardMsg, false);

        return res.send("<script>alert('கோரிக்கை அதிகாரிகளுக்கு அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/submit-delay-justification', (req, res) => {
    const { grievanceId, delayJustification } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.delayJustification = delayJustification;
        return res.send("<script>alert('தாமதத்திற்கான காரணம் எம்.எல்.ஏ-வுக்கு அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/submit-field-notes', (req, res) => {
    const { grievanceId, fieldNotes } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    if (complaint) {
        complaint.fieldNotes = fieldNotes;
        return res.send("<script>alert('கள அறிக்கை புதுப்பிக்கப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/upload-resolution', (req, res) => {
    resolutionFields(req, res, function (err) {
        if (err) return res.send(err.message);
        const { grievanceId } = req.body;
        const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
        
        if (complaint) {
            complaint.status = 'Completed';
            if (req.files && req.files['beforeImage']) complaint.beforeImage = req.files['beforeImage'][0].filename;
            if (req.files && req.files['afterImage']) {
                complaint.afterImage = req.files['afterImage'][0].filename;
                complaint.resolvedImage = req.files['afterImage'][0].filename; 
            }
            
            saveCompletedFile(complaint);

            if (req.session && req.session.userRole === 'Poruppalar') {
                if (!req.session.resolvedCount) req.session.resolvedCount = 0;
                if (!req.session.points) req.session.points = 0;
                req.session.resolvedCount += 1;
                req.session.points += 10;
            }

            const completeMsg = `மகிழ்ச்சியான செய்தி! உங்கள் மனு எண்: ${grievanceId}-ல் குறிப்பிடப்பட்ட குறை முழுமையாக நிவர்த்தி செய்யப்பட்டுள்ளது.`;
            sendNotification(complaint.citizenMobile, completeMsg, false);

            const hostUrl = req.protocol + '://' + req.get('host'); 
            const afterImageLink = `${hostUrl}/uploads/${complaint.afterImage}`;
            const whatsappCompleteMsg = `🏛️ *தமிழ்நாடு மக்கள் குறைதீர்ப்புப் பேரவை* \n\nவணக்கம், உங்களுடைய மனு எண்: *${grievanceId}*-ன் குறை நிவர்த்தி செய்யப்பட்டுள்ளது.`;
            
            sendWhatsAppMediaNotification(complaint.citizenMobile, whatsappCompleteMsg, afterImageLink);

            return res.send("<script>alert('பணி வெற்றிகரமாக முடிக்கப்பட்டது!'); window.location.href='/';</script>");
        }
        res.redirect('/');
    });
});

app.post('/appreciate-grievance', (req, res) => {
    if (!req.session || req.session.userRole !== 'MLA') return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    const { grievanceId, message } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    
    if (complaint) {
        complaint.appreciation = message || "சிறப்பான பணிக்கு மனமார்ந்த பாராட்டுக்கள்! 🏆";
        return res.send("<script>alert('உங்களின் பாராட்டுக்கள் அனுப்பப்பட்டது!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/issue-certificate', (req, res) => {
    if (!req.session || req.session.userRole !== 'MLA') return res.status(403).send('அணுகல் மறுக்கப்பட்டது!');
    const { grievanceId } = req.body;
    const complaint = complaintsList.find(c => String(c.grievanceId) === String(grievanceId));
    if (complaint) {
        complaint.certificateIssued = true;
        return res.send("<script>alert('பாராட்டுச் சான்றிதழ் வழங்கப்பட்டது! 📜'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.post('/archive-complaint', (req, res) => {
    const { grievanceId } = req.body;
    const complaint = complaintsList.find(c => c.grievanceId === grievanceId);
    
    if (complaint) {
        complaint.isArchived = true;
        
        const archiveDir = path.join(__dirname, 'archive');
        if (!fs.existsSync(archiveDir)) { fs.mkdirSync(archiveDir); }
        fs.writeFileSync(path.join(archiveDir, `${grievanceId}.json`), JSON.stringify(complaint, null, 2));

        return res.send("<script>alert('மனு வெற்றிகரமாக காப்பகப்படுத்தப்பட்டது (Archived)!'); window.location.href='/';</script>");
    }
    res.redirect('/');
});

app.get('/export-excel', async (req, res) => {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Grievance Report');

        worksheet.columns = [
            { header: 'S.No', key: 'sno', width: 8 },
            { header: 'Grievance ID', key: 'grievanceId', width: 18 },
            { header: 'Submitted Date', key: 'created_date', width: 15 },
            { header: 'Citizen Name', key: 'citizenName', width: 20 },
            { header: 'Contact Mobile', key: 'mobile', width: 15 },
            { header: 'District', key: 'district', width: 18 },
            { header: 'Constituency / Ward', key: 'ward', width: 18 },
            { header: 'Category', key: 'grievanceCategory', width: 18 },
            { header: 'Grievance Details', key: 'details', width: 35 },
            { header: 'Assigned Dept', key: 'department', width: 15 },
            { header: 'Status', key: 'status', width: 15 },
            { header: 'Archive State', key: 'archiveStatus', width: 15 }
        ];

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFF' } };
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '1E3A8A' }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
        });

        complaintsList.forEach((item, index) => {
            worksheet.addRow({
                sno: index + 1,
                grievanceId: item.grievanceId || 'N/A',
                created_date: item.created_date || 'N/A',
                citizenName: item.citizenName || 'N/A',
                mobile: item.citizenMobile || 'N/A',
                district: item.district || 'N/A',
                ward: `${item.constituency} - ${item.wardZone}`,
                grievanceCategory: item.grievanceCategory || 'N/A',
                details: item.description || 'N/A',
                department: item.forwardedTo || 'Unassigned',
                status: item.status || 'Pending',
                archiveStatus: item.isArchived ? 'Archived' : 'Active'
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + 'Grievance_Report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error("Excel Export Error: ", err);
        res.status(500).send("Excel டவுன்லோடு செய்வதில் பிழை ஏற்பட்டது!");
    }
});

app.set('views', __dirname);

app.use(express.static(vijay_cm.jpg));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started running on http://localhost:${PORT}`);
});
