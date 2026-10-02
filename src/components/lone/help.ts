/** Plain-English help shown behind the ? button on each screen. */
export const help = {
  home: [
    "Red alert: press and hold the red button for 1.5 seconds, then let go. Straight away your duty mobiles get a WhatsApp and your alert emails get an email, with your location on a map and the nearest postcode.",
    "Start a job: say where you are going and set a welfare timer. By default the timer starts when you press Arrived. The team sees you on the Board as travelling, on a visit, checked in safe, or overdue.",
    "I'm safe: press it when you are done and safe. It stops the timer and the whole team sees 'Checked in safe' with the time. End job when you leave.",
    "Before the timer ends the phone buzzes twice: at your warning time and again at 2 minutes. If you need longer, +15 min. If you do nothing, the team is alerted at zero.",
    "If you have set a PIN in Routes, I'm safe and False alarm ask for it. Your duress PIN looks identical on the phone but tells the team you are under threat.",
    "Amber note: before something risky, say or type what you are walking into. If you raise an alert in the next 12 hours, the note goes with it.",
    "While a job is open the screen stays awake. If the phone does lock, the Red alert button needs the app reopened, but a welfare timer still fires: the server holds it and raises the alarm itself.",
    "Desk shows the log kept on this phone. Board shows your team's live positions. Routes is where you set who gets your alerts.",
  ],
  alert: [
    "Your alert has already gone to your duty mobiles and alert emails. The line at the top says exactly what went.",
    "If you can, add detail (what is happening, who is with you) and send it on with the buttons below.",
    "False alarm stands the alert down and clears you from the board. Only use it if you are safe.",
  ],
  startJob: [
    "Site: the place name, e.g. Riverside Surgery.",
    "Address: type the street or the postcode. A green tick means the postcode is real and the job is pinned there. A red warning means the postcode does not exist, so check it.",
    "Known about this address: once the address is pinned, you see what your team has recorded there in the last year: previous alerts (added automatically) and notes like 'large dog' or 'key safe by the side door'. You can add your own during the visit.",
    "Arrival is detected automatically when the phone comes within 100 m of the pinned address with the app open. Press Arrived if it hasn't noticed, or if there is no pin.",
    "Welfare timer: how long you expect to be. You get a warning before it ends. If it runs out before you press I'm safe or End job, the server sends a welfare alert to your duty mobiles and alert emails, even if this phone is locked, flat or out of signal.",
    "Note for the desk: anything a responder should know, like a code for the door or a dog on site.",
  ],
  amberNote: [
    "Use this just before a risky moment: going into a property, meeting someone new, a gate left open.",
    "Type a note, record your voice, or both, then press Save.",
    "Nobody is messaged when you save. If you raise a Red alert within 12 hours, your last 3 notes are added to the alert, and the recordings are attached to the alert email.",
    "If there is no signal, you can save on this phone only. That copy will not go out with an alert.",
  ],
  desk: [
    "This is the log kept on this phone: alerts, jobs and amber notes, newest first.",
    "Other people cannot see this page. To see everyone at once, use the Board.",
    "Acknowledge marks an alert as seen. Resolve closes it with a note of what happened.",
    "Evidence pack on an alert opens a full record of it: timeline, who was told, location trail and address notes, ready to save as PDF for an incident report, HR or the police.",
  ],
  evidence: [
    "A record of one alert, built from the system's own data: what happened and when, who was told and whether it got through, where the worker was while the alert was open, their amber notes beforehand, and what the team had recorded about the address.",
    "Save as PDF / print uses your phone or computer's print dialogue. Email sends the PDF to the alert emails that were set when the alert was raised.",
    "When a worker stands an alert down, the pack is emailed to the alert emails automatically.",
    "Only the phone that raised the alert, or someone on the same board code, can open a pack.",
  ],
  board: [
    "The Board shows everyone on your team: where they are, whether they are travelling, on a visit (with the due-back time), checked in safe, or overdue, plus any open alert.",
    "Below the pins is every visit from the last 24 hours, so a supervisor can see who went where and whether they checked in.",
    "Everyone on the team types the same board code (4 to 8 letters or numbers). Anyone with the code can see the pins, so keep it to your team.",
    "A pin is live while that person has the app open and updates every 45 seconds. If their phone locks, the pin stays, greyed out, with when they were last seen. People drop off the board after 12 hours.",
    "To come off the Board yourself, tap Leave this board under the code. To tidy someone else's grey pin, tap Remove from board; a live person or an open alert can't be removed.",
  ],
  routes: [
    "This is where your alerts go. Set it once, press Send a test to everyone, and check they all got it.",
    "Every setting has its own ? button next to its name. Tap it for what that setting does.",
    "Duty mobiles get a WhatsApp (or a text if WhatsApp fails) and alert emails get an email, all within seconds of an alert. Up to 8 of each.",
    "WhatsApp groups: apps are not allowed to post into a WhatsApp group, so there is no group setting. Each duty mobile is messaged directly instead, which also reaches people who are not in a group.",
  ],
} as const;
