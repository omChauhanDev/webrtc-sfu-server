const transporter = require("../config/nodeMailerTransport");
const path = require("path");

exports.sendMail = async (req, res) => {
  try {
    const { email, senderFullName, inviteLink } = req.body;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              font-family: Arial, sans-serif;
              color: #333;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #2563eb;
              margin-bottom: 10px;
            }
            .content {
              background-color: #f8fafc;
              border-radius: 8px;
              padding: 30px;
              margin-bottom: 20px;
            }
            .button {
              display: inline-block;
              background-color: #2563eb;
              padding: 12px 24px;
              border-radius: 6px;
              text-decoration: none;
              margin: 20px 0;
            }
            .button, .button:visited, .button:hover, .button:active {
              color: #ffffff !important;
            }
            .footer {
              text-align: center;
              font-size: 14px;
              color: #64748b;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">SyncSpace</div>
            </div>
            <div class="content">
              <h2>You've Been Invited!</h2>
              <p>Hi there,</p>
              <p><strong>${senderFullName}</strong> has invited you to connect on SyncSpace.</p>
              
              <center>
                <form action="https://localhost:8000/api/mail/join-space" method="POST">
                  <input type="hidden" name="inviteLink" value="${inviteLink}" />
                  <button type="submit" class="button">Join Space</button>
                </form>
              </center>
            </div>
            <div class="footer">
              <p>This is an automated message from SyncSpace. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const info = await transporter.sendMail({
      from: "syncspace.web@gmail.com",
      to: `${email}`,
      subject: `${senderFullName} invited you to connect on SyncSpace`,
      html: htmlContent,
    });

    return res.status(200).json({
      success: true,
      message: "Invitation sent successfully!",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to send invitation",
      error: error.message,
    });
  }
};

exports.handleInvitationClick = async (req, res) => {
  try {
    const { inviteLink } = req.body;

    // Serve the HTML page with the inviteLink embedded
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Join SyncSpace</title>
          <link href="https://cdn.jsdelivr.net/npm/daisyui@latest/dist/full.css" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.1/css/all.min.css">
      </head>
      <body>
          <div class="min-h-screen bg-base-200 flex items-center justify-center p-4">
              <div class="card w-full max-w-2xl bg-base-100 shadow-xl">
                  <div class="card-body items-center text-center space-y-6">
                      <div class="avatar placeholder">
                          <div class="bg-neutral text-neutral-content rounded-full w-24">
                              <span class="text-3xl"><i class="fas fa-video-slash"></i></span>
                          </div>
                      </div>
                      
                      <h2 class="card-title text-3xl font-bold">Ready to Join?</h2>
                      
                      <p class="text-base-content/80 max-w-md">
                          Choose your preferred way to join the space. You can enable or disable your camera and microphone before joining.
                      </p>
                      
                      <div class="flex flex-wrap gap-4 justify-center mt-6">
                          <div class="flex flex-col items-center gap-2">
                              <button class="btn btn-circle btn-lg" onclick="toggleCamera()" id="cameraBtn">
                                  <i class="fas fa-video-slash" id="cameraIcon"></i>
                              </button>
                              <span class="text-sm">Camera</span>
                          </div>
                          <div class="flex flex-col items-center gap-2">
                              <button class="btn btn-circle btn-lg" onclick="toggleMic()" id="micBtn">
                                  <i class="fas fa-microphone-slash" id="micIcon"></i>
                              </button>
                              <span class="text-sm">Microphone</span>
                          </div>
                      </div>

                      <button onclick="joinSpace()" class="btn btn-primary btn-lg mt-6">
                          Join Space
                      </button>

                      <div class="alert alert-info shadow-lg mt-4">
                          <i class="fas fa-info-circle"></i>
                          <span>Your preferences will be saved when you join the space.</span>
                      </div>
                  </div>
              </div>
          </div>
          <script>
              let cameraEnabled = false;
              let micEnabled = false;
              const inviteLink = "${inviteLink}";

              function toggleCamera() {
                  cameraEnabled = !cameraEnabled;
                  const icon = document.getElementById('cameraIcon');
                  const btn = document.getElementById('cameraBtn');
                  icon.className = cameraEnabled ? 'fas fa-video' : 'fas fa-video-slash';
                  btn.className = 'btn btn-circle btn-lg ' + (cameraEnabled ? 'btn-primary' : '');
              }

              function toggleMic() {
                  micEnabled = !micEnabled;
                  const icon = document.getElementById('micIcon');
                  const btn = document.getElementById('micBtn');
                  icon.className = micEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
                  btn.className = 'btn btn-circle btn-lg ' + (micEnabled ? 'btn-primary' : '');
              }

              function joinSpace() {
                  const joinUrl = new URL(inviteLink);
                  joinUrl.searchParams.set('initialAudio', micEnabled ? 'true' : 'false');
                  joinUrl.searchParams.set('initialVideo', cameraEnabled ? 'true' : 'false');
                  window.location.href = joinUrl.toString();
              }
          </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error processing invitation");
  }
};
