const formStatus = document.getElementById("formStatus");

document.getElementById("verificationForm").addEventListener("submit", submitVerificationForm);
setupMotion();

async function submitVerificationForm(event) {
  event.preventDefault();
  formStatus.textContent = "Submitting verification package...";
  const form = event.currentTarget;
  const payload = new FormData(form);

  try {
    const response = await fetch("/api/submissions", {
      method: "POST",
      body: payload
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to submit verification.");
    }
    formStatus.textContent = `Verification submitted for ${data.submission.teamName}.`;
    form.reset();
  } catch (error) {
    formStatus.textContent = error.message;
  }
}

function setupMotion() {
  const reveals = document.querySelectorAll(".reveal");
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18 }
  );

  reveals.forEach((element) => observer.observe(element));
}
