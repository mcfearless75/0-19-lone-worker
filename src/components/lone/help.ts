/** Plain-English help shown behind the ? button on each screen. */
export const help = {
  home: [
    "Red alert: press and hold the red button for 1.5 seconds, then let go. Straight away your duty mobiles get a WhatsApp and your alert emails get an email, with your location on a map and the nearest postcode.",
    "Start a job: say where you are going and set a welfare timer. By default the timer starts when you press Arrived. The team sees you on the Board as travelling, on a visit, checked in safe, or overdue.",
    "I'm safe: press it when you are done and safe. It stops the timer and the whole team sees 'Checked in safe' with the time. End job when you leave.",
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
  ],
  board: [
    "The Board shows everyone on your team: where they are, whether they are travelling, on a visit (with the due-back time), checked in safe, or overdue, plus any open alert.",
    "Below the pins is every visit from the last 24 hours, so a supervisor can see who went where and whether they checked in.",
    "Everyone on the team types the same board code (4 to 8 letters or numbers). Anyone with the code can see the pins, so keep it to your team.",
    "A pin is live while that person has the app open and updates every 45 seconds. If their phone locks, the pin stays, greyed out, with when they were last seen. People drop off the board after 12 hours.",
  ],
  routes: [
    "This is where your alerts go. Set it once and test it.",
    "Duty mobiles: up to 8 numbers that get a WhatsApp the moment you raise an alert. Each person must have joined the WhatsApp service first (ask your manager for the join message).",
    "Alert emails: up to 8 addresses, separated by commas. Each one gets an email at the same moment, with any voice notes attached.",
    "WhatsApp group link only opens the group on your phone. It cannot post into the group by itself. The duty mobiles are what actually gets messaged.",
    "WhatsApp on check-in: off by default, because the Board already shows every check-in and a message per visit soon gets ignored. Turn it on if your team wants one.",
    "Discreet screen: after an alert, the phone shows a plain screen so nobody nearby can see that an alert went out.",
  ],
} as const;
