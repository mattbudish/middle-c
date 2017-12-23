'use strict'

$(document).ready(() => {
    $('#generate').submit((event) => {
        let url = 'api/' + $('#fileName').val()

        $('#content').text('Waiting for server. . .')

        $.get(url, (data, status) => {
            if (status === 'success') {
                $('#content').text(JSON.stringify(data, null, 4))
            } else {
                $('#content').text('')
                alert('Failure to generate JSON for', $('#fileName').val())
            }
        })

        event.preventDefault()
    })
})
