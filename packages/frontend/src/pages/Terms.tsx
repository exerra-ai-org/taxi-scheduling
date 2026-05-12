// Placeholder Terms & Conditions page. Replace this copy with the legally
// reviewed text before going to production. Layout follows the same
// rhythm as the rest of the customer pages so it reads in the modal-out
// view from the sign-up form.

export default function Terms() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-[var(--color-mid)]">
      <p className="section-label">/ Legal</p>
      <h1 className="mb-6 text-[34px] font-bold leading-tight tracking-[-0.04em] text-[var(--color-dark)]">
        Terms &amp; Conditions
      </h1>

      <p className="mb-4 text-sm leading-6">
        These Terms &amp; Conditions are placeholder copy. Replace this page
        with your finalised legal text before launch. The fields below outline
        the typical structure; treat them as a starting scaffold.
      </p>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          1. Acceptance
        </h2>
        <p className="text-sm leading-6">
          By creating an account or booking a ride, you accept these terms in
          full. If you do not accept them, do not use the service.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          2. Bookings &amp; payment
        </h2>
        <p className="text-sm leading-6">
          Card payments are taken at the time of booking for rides within the
          authorisation window. Cash bookings require a 25% non-refundable
          deposit charged to a card; the balance is collected in person at the
          time of the ride.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          3. Waiting time &amp; no-shows
        </h2>
        <p className="text-sm leading-6">
          A 30-minute free waiting period applies once the driver has arrived
          at the pickup location. After that, a waiting fee accrues at £2 per 5
          minutes. If the passenger does not present themselves within the
          no-show threshold the booking may be cancelled and the full fare and
          waiting fee become payable.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          4. Cancellation
        </h2>
        <p className="text-sm leading-6">
          Cancellation fees depend on how close to pickup the cancellation is
          requested. See the booking confirmation for the policy applied to
          your ride.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          5. Conduct
        </h2>
        <p className="text-sm leading-6">
          Abusive, threatening or unsafe behaviour towards drivers or staff
          will result in the booking being terminated without refund and the
          account suspended.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          6. Liability
        </h2>
        <p className="text-sm leading-6">
          The service is provided on an &quot;as is&quot; basis. To the maximum
          extent permitted by law, liability for indirect or consequential loss
          is excluded.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-lg font-semibold text-[var(--color-dark)]">
          7. Changes
        </h2>
        <p className="text-sm leading-6">
          We may update these terms from time to time. Material changes will be
          communicated via email or in-app notice.
        </p>
      </section>

      <p className="mt-12 text-xs text-[var(--color-muted)]">
        Last updated: replace this date with the effective date of the
        finalised terms.
      </p>
    </div>
  );
}
