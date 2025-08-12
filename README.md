# Iframe CSP Sandbox Example
Guide for Iframe and Content Security Policy (CSP)

## 📝 Table of Contents
- [About](#about)
- [Getting Started](#getting_started)
- [Information](#information)

## 🧐 About <a name = "about"></a>

- [x] Iframe CSP Sandboxing

## 🏁 Getting Started <a name = "getting_started"></a>

```
npm install
npm start

http://localhost:3000/iframecspsandbox.html

```

## Information <a name = "information"></a>

 - [x] Security
    ```
    When using an iframe, we are dealing with content coming from third
    party.
    you are increasing the risk of having potential vulnerability attack
    in your application.
    Luckily, we got "sandbox" attribute
    ```
    ```
    Rule of thumb: follow "the principle of least privilege"
    ```
 - [x] sandbox="allow-same-origin"

 - [x] referrerPolicy="strict-origin"

 - [x] Attribute details:

 <table>
     <thead>
     <tr>
         <th>Flag</th>
         <th>Details</th>
     </tr>
     </thead>
     <tbody>
     <tr>
         <td><strong>allow-forms</strong></td>
         <td>Allows form submission.</td>
     </tr>
     <tr>
         <td><strong>allow-modals</strong></td>
         <td>Allows the resource to open new modal windows.</td>
     </tr>
     <tr>
         <td><strong>allow-orientation-lock</strong></td>
         <td>Allows the resource to lock the screen orientation.</td>
     </tr>
     <tr>
         <td><strong>allow-pointer-lock</strong></td>
         <td>Allows the resource to use the Pointer Lock API.</td>
     </tr>
     <tr>
         <td><strong>allow-popups</strong></td>
         <td>Allows the resource to open new popups or tabs.</td>
     </tr>
     <tr>
         <td><strong>allow-popups-to-escape-sandbox</strong></td>
         <td>Allows the resource to open new windows that will not inherit the sandboxing.</td>
     </tr>
     <tr>
         <td><strong>allow-presentation</strong></td>
         <td>Allows the resource to start a presentation session.</td>
     </tr>
     <tr>
         <td><strong>allow-same-origin</strong></td>
         <td>Allows the resource to maintain its origin.</td>
     </tr>
     <tr>
         <td><strong>allow-scripts</strong></td>
         <td>Allows the resource to run scripts.</td>
     </tr>
     <tr>
         <td><strong>allow-top-navigation</strong></td>
         <td>Allows the resource to navigate the top-level browsing context.</td>
     </tr>
     <tr>
         <td><strong>allow-top-navigation-by-user-activation</strong></td>
         <td>Allows the resource to navigate the top-level browsing context, but only if initiated by a user gesture.</td>
     </tr>
     </tbody>
 </table>

