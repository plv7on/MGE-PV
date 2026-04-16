const submitCopy = document.getElementById("submitCopy");
const stepReview = document.getElementById("stepReview");
const stepDone = document.getElementById("stepDone");
const params = new URLSearchParams(window.location.search);
const teamName = params.get("team");

if (teamName) {
  submitCopy.textContent = `${teamName} has been added to the verification queue. The admin team will review both documents soon.`;
}

setTimeout(() => {
  stepReview.classList.add("active-step");
}, 700);

setTimeout(() => {
  stepDone.classList.add("active-step");
}, 1500);
