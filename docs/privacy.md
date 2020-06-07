# Your Privacy Matters

We are just a bunch of independant folks with a passion for ChromeOS who happen to also rely on Microsoft's OneDrive service.
As such, we have no interest in collecting your personal data.  We don't care who you are or what you had for lunch last thurdsday.  If you love ChromeOS then you're OK by us.

# Are You Collecting Data?

In short, yes.  The OneDrive app collects anonymous data about the app itself.  This is used by us to work out if an update to our app is causing folks problems, and helps us to idenfity and fix it.  That really is all we're interested in after all.

# What Data Do You Get?

The information is collected via an API from the lovely folks over at [Sentry.io](https://sentry.io/) where it is sent and stored (ie. not by us).  In line with EU GDPR guidelines, we do not collect or store ANY personally identifiable information.  Any informaiton collected is limited to that which is needed to debug and diagnose faults with our app. It includes things like:

* Filenames & Paths being accessed
This allows us to spot problems with string/character recognition or even file-type compatibility problems

* The line of code being executed at the moment the software failed

* Operating System Version (ie ChromeOS version number)

# How do you ensure you're not collecting Personal Information?

The good folks over [Sentry.io](https://sentry.io/) use data scrubbers which ensure all incoming information is anonymised... So things like Names, Email Addresses, IP Addresses, Usernames and even Passwords or Credit Card details are randomised & scrambled safely beyond recognition.

# I'm still not comfortable

That makes us a little sad, but we do understand the predicament.  We're going to make the telemetry of data optional in a future update, but right now if you're not happy with this usage of information do NOT use this software.
