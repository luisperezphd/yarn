Yarn, is a serverless, end-to-end encrypted, message thread.

Video: https://youtu.be/SteWs6gX69g

Live: https://luisperezphd.github.io/yarn/dist/yarn.html

Code: https://github.com/luisperezphd/yarn

# How to Use

Open dist/yarn.html

Use it the way you would use Threads.

Create a thread by clicking on the "Start a thread...", or by clicking the edit icon on the top nav.

Or reply or like a post by clicking on the talk bubble or heart icon.

When you try to perform an action on a post like creating or replying to one you will be prompted to created a log in.

The login only exists inside this thread.

When you create a log in you will be provided with a key that you can use to log back into that thread later.

Finally you share your thread using the airplane icon on the top nav, copying and sharing the link.

When someone opens that link they will have the same experience.

They will be able to see the thread and to interact with the posts after they create a login.

# How it works

The whole state of the thread is stored in the URL as a hash.

For security the state is compressed and encrypted.

This means the only way to share the thread is using the app share button.

Trying to copy and paste the browser URL will not allow you to see the thread.

Same goes for bookmarking the page, or accessing browser history.

When you share a thread it also generates an encrypted URL.

The difference is that the URL actually has a key embeded into it.

That URL you can always use to open that state of the thread.

The moment you open it though the URL is encrypted and safe again.

The way the login key works by storing the encrypted username along with the user. If login key you provide successfully generated the same encrypted content then that must have been you.

# Improvements

It would be great to detect whether the contents of the thread portion you shared have been altertered.

To stay within the challenge parameters the whole state was stored in the hash and no other state was used, but using local store could help create a better experience. For example it could be used to store the login key, while still recommending saving a backup.

It might be useful to explore the idea of sharing a particular post/thread and then being able to merge those results back. Something like this would be useful if you shared your thread with multiple people at the same time.

There might be room to improve compression to reduce the size of the URL, didn't really get a chance to try that.

Support more than 4 users. Really this is about offering more options for profile photos, or allowing use of the same photo. Or maybe having something like an avatar builder and storing the parameters instead of a an image.

Instead or in addition to being able to paste a link to your browser, we could provide an option to "open a thread" and allow pasting the link. This would make it more convinient to use yarn.html right on your computer, since otherwise the url generate would be particular to that computer. Maybe yarn could detect that it's a local usage and (file://) protocol and offer instructions and state instead of a link.

Make it responsive / mobile friendly.


